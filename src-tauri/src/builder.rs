//! Builder de Windows sin bloatware (crea una ISO nueva a partir de la ISO oficial).
//! El trabajo pesado lo hace builder.ps1 (DISM); aquí se lanza, se lee su progreso
//! y se reenvía a la interfaz como eventos "builder".

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static RUNNING: Mutex<Option<u32>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone)]
pub struct Edition {
    pub index: u32,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct IsoInfo {
    pub editions: Vec<Edition>,
    pub arch: String,
    pub version: String,
    pub size: u64,
    pub esd: bool,
}

fn check_iso(path: &str) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".iso") || path.contains('\n') {
        return Err("Elige un archivo .iso".into());
    }
    Ok(())
}

pub fn inspect(iso: &str) -> Result<IsoInfo, String> {
    check_iso(iso)?;
    ps::run_json(&format!(
        r#"
$iso = {iso}
$img = Mount-DiskImage -ImagePath $iso -StorageType ISO -PassThru
try {{
  $letter = ($img | Get-Volume).DriveLetter
  $root = "${{letter}}:\sources"
  $file = if (Test-Path "$root\install.wim") {{ "$root\install.wim" }} elseif (Test-Path "$root\install.esd") {{ "$root\install.esd" }} else {{ throw 'Esta ISO no tiene install.wim ni install.esd: no es una ISO de instalación de Windows.' }}
  $list = @(Get-WindowsImage -ImagePath $file)
  $first = Get-WindowsImage -ImagePath $file -Index $list[0].ImageIndex
  $arch = switch ($first.Architecture) {{ 9 {{ 'x64' }} 12 {{ 'ARM64' }} 0 {{ 'x86' }} default {{ [string]$first.Architecture }} }}
  ConvertTo-Json -Compress -Depth 4 -InputObject ([ordered]@{{
    editions = @($list | ForEach-Object {{ [ordered]@{{ index = [int]$_.ImageIndex; name = [string]$_.ImageName }} }})
    arch = $arch
    version = [string]$first.Version
    size = [uint64](Get-Item -LiteralPath $iso).Length
    esd = $file.EndsWith('.esd')
  }})
}} finally {{
  Dismount-DiskImage -ImagePath $iso -ErrorAction SilentlyContinue | Out-Null
}}
"#,
        iso = q(iso)
    ))
}

pub fn hash(iso: &str) -> Result<String, String> {
    check_iso(iso)?;
    ps::run(&format!("(Get-FileHash -LiteralPath {} -Algorithm SHA256).Hash", q(iso)))
}

#[derive(Deserialize)]
pub struct BuildOptions {
    pub iso: String,
    pub out: String,
    pub index: u32,
    pub profile: String,
    pub bypass: bool,
    pub local_account: bool,
    pub deep_clean: bool,
    pub esd: bool,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Event {
    Step { n: u32, text: String },
    Log { text: String },
    Done { path: String, size: u64 },
    Error { text: String },
    End,
}

fn b(v: bool) -> &'static str {
    if v { "$true" } else { "$false" }
}

pub fn start(app: AppHandle, o: BuildOptions) -> Result<(), String> {
    check_iso(&o.iso)?;
    if !o.out.to_lowercase().ends_with(".iso") || o.out.len() < 4 || o.out.contains('\n') {
        return Err("La ISO de salida debe terminar en .iso".into());
    }
    if o.out.eq_ignore_ascii_case(&o.iso) {
        return Err("La ISO de salida no puede ser la misma que la original".into());
    }
    if !["ligero", "gaming", "minimo"].contains(&o.profile.as_str()) {
        return Err("Perfil desconocido".into());
    }
    let mut running = RUNNING.lock().map_err(|e| e.to_string())?;
    if running.is_some() {
        return Err("Ya hay una compilación en marcha".into());
    }

    let script = format!(
        "$Iso = {}\n$Out = {}\n$Index = {}\n$BuildProfile = {}\n$Bypass = {}\n$LocalAccount = {}\n$DeepClean = {}\n$Esd = {}\n{}",
        q(&o.iso),
        q(&o.out),
        o.index,
        q(&o.profile),
        b(o.bypass),
        b(o.local_account),
        b(o.deep_clean),
        b(o.esd),
        include_str!("../builder.ps1")
    );
    let path = std::env::temp_dir().join(format!("ghostnet_builder_{}.ps1", std::process::id()));
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(script.as_bytes());
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let mut child = ps::command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo iniciar PowerShell: {e}"))?;
    *running = Some(child.id());
    drop(running);

    std::thread::spawn(move || {
        let emit = |e: Event| {
            let _ = app.emit("builder", e);
        };
        let mut done = false;
        let mut failed = false;
        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let mut parts = line.trim_end().splitn(4, '|');
                match parts.next() {
                    Some("@@STEP") => {
                        let n = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
                        emit(Event::Step { n, text: parts.collect::<Vec<_>>().join("|") });
                    }
                    Some("@@LOG") => emit(Event::Log { text: parts.collect::<Vec<_>>().join("|") }),
                    Some("@@ERROR") => {
                        failed = true;
                        emit(Event::Error { text: parts.collect::<Vec<_>>().join("|") });
                    }
                    Some("@@DONE") => {
                        let path = parts.next().unwrap_or_default().to_string();
                        let size = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                        done = true;
                        emit(Event::Done { path, size });
                    }
                    _ => {}
                }
            }
        }
        let mut err = String::new();
        if let Some(mut e) = child.stderr.take() {
            let _ = e.read_to_string(&mut err);
        }
        let status = child.wait();
        let cancelled = RUNNING.lock().map(|r| r.is_none()).unwrap_or(false);
        if !done && !cancelled && !failed {
            let ok = status.map(|s| s.success()).unwrap_or(false);
            let msg = err
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty() && !l.starts_with('+') && !l.starts_with("At ") && !l.starts_with("En ") && !l.contains("CategoryInfo") && !l.contains("FullyQualifiedErrorId"))
                .collect::<Vec<_>>()
                .join(" ");
            emit(Event::Error {
                text: if msg.is_empty() {
                    if ok { "El proceso terminó sin crear la ISO.".into() } else { "El proceso terminó con un error.".into() }
                } else {
                    msg
                },
            });
        }
        if let Ok(mut r) = RUNNING.lock() {
            *r = None;
        }
        let _ = std::fs::remove_file(&path);
        emit(Event::End);
    });
    Ok(())
}

/// Detiene la compilación y deja el sistema limpio (desmonta imágenes, descarga hives, borra temporales).
pub fn cancel(out: &str, iso: &str) -> Result<(), String> {
    let pid = RUNNING.lock().map_err(|e| e.to_string())?.take();
    if let Some(pid) = pid {
        let _ = ps::command("taskkill.exe").args(["/PID", &pid.to_string(), "/T", "/F"]).output();
    }
    let drive: String = out.chars().take(2).collect();
    if drive.len() != 2 || !drive.ends_with(':') {
        return Ok(());
    }
    ps::run(&format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$work = {work}
foreach ($k in 'zSOFTWARE', 'zSYSTEM', 'zDEFAULT', 'zNTUSER') {{ & reg.exe unload "HKLM\$k" 2>&1 | Out-Null }}
foreach ($m in @(Get-WindowsImage -Mounted | Where-Object {{ $_.Path -like "$work*" }})) {{ Dismount-WindowsImage -Path $m.Path -Discard | Out-Null }}
Clear-WindowsCorruptMountPoint | Out-Null
Dismount-DiskImage -ImagePath {iso} | Out-Null
Remove-Item -LiteralPath $work -Recurse -Force
"#,
        work = q(&format!("{drive}\\ghostnet_build")),
        iso = q(iso)
    ))
    .map(|_| ())
}

pub fn running() -> bool {
    RUNNING.lock().map(|r| r.is_some()).unwrap_or(false)
}

pub fn reveal(path: &str) -> Result<(), String> {
    ps::command("explorer.exe")
        .arg(format!("/select,{path}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn open_iso_download() -> Result<(), String> {
    ps::command("explorer.exe")
        .arg("https://www.microsoft.com/software-download/windows11")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
