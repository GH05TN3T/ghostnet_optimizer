//! Drivers: detecta la laptop y los dispositivos sin controlador, baja e instala
//! drivers desde Windows Update, e instala/repara WMIC (que Windows 11 ya no trae de serie).

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize)]
pub struct Device {
    pub name: String,
    pub class: String,
    pub status: String,
    /// Código de error del Administrador de dispositivos (28 = sin driver).
    pub problem: i64,
    pub instance_id: String,
}

#[derive(Serialize, Deserialize)]
pub struct Status {
    pub manufacturer: String,
    pub model: String,
    pub sku: String,
    pub serial: String,
    pub bios: String,
    pub os: String,
    /// Dispositivos presentes que no funcionan bien (normalmente les falta el driver).
    pub missing: Vec<Device>,
    /// Estado de WMIC: "present" | "absent" | "unknown".
    pub wmic: String,
}

/// Detecta la máquina, los dispositivos con problemas y si WMIC está instalado.
pub fn status() -> Result<Status, String> {
    let script = r#"
$cs   = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$os   = Get-CimInstance Win32_OperatingSystem

$bad = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.Status -ne 'OK' -and $_.Class -ne 'SoftwareDevice' } |
  ForEach-Object {
    [pscustomobject]@{
      name        = [string]$_.FriendlyName
      class       = [string]$_.Class
      status      = [string]$_.Status
      problem     = [int]$_.Problem
      instance_id = [string]$_.InstanceId
    }
  })

# WMIC: comprobar la capacidad opcional (Windows 11 ya no la trae por defecto).
$wmic = 'unknown'
try {
  $cap = Get-WindowsCapability -Online -ErrorAction Stop | Where-Object { $_.Name -like 'Wmic*' } | Select-Object -First 1
  if ($cap) { $wmic = if ($cap.State -eq 'Installed') { 'present' } else { 'absent' } }
  elseif (Get-Command wmic.exe -ErrorAction SilentlyContinue) { $wmic = 'present' }
} catch {
  if (Get-Command wmic.exe -ErrorAction SilentlyContinue) { $wmic = 'present' } else { $wmic = 'unknown' }
}

[pscustomobject]@{
  manufacturer = [string]$cs.Manufacturer
  model        = [string]$cs.Model
  sku          = [string]$cs.SystemSKUNumber
  serial       = [string]$bios.SerialNumber
  bios         = [string]$bios.SMBIOSBIOSVersion
  os           = ("{0} ({1})" -f $os.Caption, $os.Version)
  missing      = $bad
  wmic         = $wmic
} | ConvertTo-Json -Depth 4 -Compress
"#;
    let mut s: Status = ps::run_json(script)?;
    // Normaliza espacios sobrantes que algunos OEM dejan en el modelo.
    s.manufacturer = s.manufacturer.trim().to_string();
    s.model = s.model.trim().to_string();
    s.sku = s.sku.trim().to_string();
    Ok(s)
}

// ---------- Instalar WMIC ----------

/// Instala (o repara) la capacidad WMIC desde Windows Update. Necesita internet.
pub fn wmic_install() -> Result<String, String> {
    let script = r#"
$cap = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'Wmic*' } | Select-Object -First 1
if (-not $cap) { throw 'Esta versión de Windows no ofrece WMIC como función opcional.' }
if ($cap.State -eq 'Installed') { 'present'; return }
Add-WindowsCapability -Online -Name $cap.Name -ErrorAction Stop | Out-Null
$after = Get-WindowsCapability -Online | Where-Object { $_.Name -like 'Wmic*' } | Select-Object -First 1
if ($after -and $after.State -eq 'Installed') { 'present' }
else { throw 'Windows no pudo instalar WMIC. Revisa que tengas internet y que Windows Update no esté bloqueado.' }
"#;
    let out = ps::run(script)?;
    if out.contains("present") {
        Ok("present".into())
    } else {
        Err("Windows no confirmó la instalación de WMIC.".into())
    }
}

// ---------- Bajar drivers desde Windows Update ----------

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Event {
    /// Buscando actualizaciones de driver.
    Searching,
    /// Número de drivers encontrados.
    Found { count: u32 },
    /// Empezando con un driver (title) — index de total.
    Item { title: String, index: u32, total: u32 },
    /// Fase de un driver: "download" | "install".
    Phase { phase: String },
    /// Un driver terminó.
    Installed { title: String, ok: bool },
    /// Todo terminó. reboot = Windows pide reiniciar.
    Done { installed: u32, reboot: bool },
    Error { text: String },
    End,
}

/// Script que usa el agente de Windows Update (WUA) para buscar, descargar e instalar
/// SOLO drivers. Emite líneas @@ que el hilo de abajo convierte en eventos.
fn update_script() -> String {
    format!(
        r#"
$ErrorActionPreference = 'Stop'
function Say($x) {{ Write-Output $x; [Console]::Out.Flush() }}

Say '@@SEARCH'
$session  = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
# Incluir el servicio de Microsoft Update (donde viven muchos drivers OEM).
try {{
  $sm = New-Object -ComObject Microsoft.Update.ServiceManager
  $sm.AddService2('7971f918-a847-4430-9279-4a52d1efe18d',7,'') | Out-Null
  $searcher.ServerSelection = 3
  $searcher.ServiceID = '7971f918-a847-4430-9279-4a52d1efe18d'
}} catch {{ $searcher.ServerSelection = 2 }}  # 2 = Windows Update normal si falla

$result = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
$updates = @($result.Updates)
Say ('@@FOUND|' + $updates.Count)
if ($updates.Count -eq 0) {{ Say '@@DONE|0|0'; return }}

$installed = 0
$reboot = $false
$i = 0
foreach ($u in $updates) {{
  $i++
  $title = $u.Title -replace '[\r\n|]', ' '
  Say ('@@ITEM|' + $title + '|' + $i + '|' + $updates.Count)

  $coll = New-Object -ComObject Microsoft.Update.UpdateColl
  $u.AcceptEula() | Out-Null
  $coll.Add($u) | Out-Null

  Say '@@PHASE|download'
  $dl = $session.CreateUpdateDownloader()
  $dl.Updates = $coll
  try {{ $dl.Download() | Out-Null }} catch {{ Say ('@@ITEMDONE|' + $title + '|0'); continue }}

  Say '@@PHASE|install'
  $inst = $session.CreateUpdateInstaller()
  $inst.Updates = $coll
  try {{
    $r = $inst.Install()
    $ok = ($r.ResultCode -eq 2)   # 2 = succeeded
    if ($ok) {{ $installed++ }}
    if ($r.RebootRequired) {{ $reboot = $true }}
    Say ('@@ITEMDONE|' + $title + '|' + ([int]$ok))
  }} catch {{ Say ('@@ITEMDONE|' + $title + '|0') }}
}}
Say ('@@DONE|' + $installed + '|' + ([int]$reboot))
"#
    )
}

/// Lanza la búsqueda/instalación de drivers en un hilo y emite eventos "drivers".
pub fn update(app: AppHandle) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Esta herramienta solo funciona en Windows.".into());
    }
    // Escribimos el script con BOM, igual que ps::run, pero lo lanzamos en streaming.
    let path = std::env::temp_dir().join(format!("optimizador_drivers_{}.ps1", std::process::id()));
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        f.write_all(&[0xEF, 0xBB, 0xBF]).map_err(|e| e.to_string())?;
        f.write_all(ps::PRELUDE.as_bytes()).map_err(|e| e.to_string())?;
        f.write_all(b"\r\n").map_err(|e| e.to_string())?;
        f.write_all(update_script().as_bytes()).map_err(|e| e.to_string())?;
    }

    let mut child = ps::command("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo iniciar PowerShell: {e}"))?;

    std::thread::spawn(move || {
        let emit = |e: Event| {
            let _ = app.emit("drivers", e);
        };
        let mut done = false;
        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let line = line.trim_end();
                let mut p = line.split('|');
                match p.next() {
                    Some("@@SEARCH") => emit(Event::Searching),
                    Some("@@FOUND") => {
                        let count = p.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                        emit(Event::Found { count });
                    }
                    Some("@@ITEM") => {
                        // title puede venir vacío; index/total son los dos últimos campos.
                        let rest: Vec<&str> = p.collect();
                        let total = rest.last().and_then(|v| v.parse().ok()).unwrap_or(0);
                        let index = rest.get(rest.len().wrapping_sub(2)).and_then(|v| v.parse().ok()).unwrap_or(0);
                        let title = if rest.len() > 2 { rest[..rest.len() - 2].join(" ") } else { String::new() };
                        emit(Event::Item { title, index, total });
                    }
                    Some("@@PHASE") => emit(Event::Phase { phase: p.next().unwrap_or("").to_string() }),
                    Some("@@ITEMDONE") => {
                        let rest: Vec<&str> = p.collect();
                        let ok = rest.last().map(|v| *v == "1").unwrap_or(false);
                        let title = if rest.len() > 1 { rest[..rest.len() - 1].join(" ") } else { String::new() };
                        emit(Event::Installed { title, ok });
                    }
                    Some("@@DONE") => {
                        let installed = p.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                        let reboot = p.next().map(|v| v == "1").unwrap_or(false);
                        done = true;
                        emit(Event::Done { installed, reboot });
                    }
                    _ => {}
                }
            }
        }
        let mut err = String::new();
        if let Some(mut e) = child.stderr.take() {
            let _ = e.read_to_string(&mut err);
        }
        let _ = child.wait();
        if !done {
            let msg = err
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty() && !l.starts_with('+') && !l.starts_with("At ") && !l.starts_with("En ") && !l.contains("CategoryInfo") && !l.contains("FullyQualifiedErrorId"))
                .collect::<Vec<_>>()
                .join(" ");
            emit(Event::Error {
                text: if msg.is_empty() {
                    "No se pudo completar la búsqueda de drivers. ¿Tienes internet y Windows Update activo?".into()
                } else {
                    msg
                },
            });
        }
        let _ = std::fs::remove_file(&path);
        emit(Event::End);
    });
    Ok(())
}

/// Abre una URL (http/https) en el navegador predeterminado.
pub fn open_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Enlace no válido.".into());
    }
    ps::command("explorer.exe")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Abre el Administrador de dispositivos de Windows.
pub fn open_device_manager() -> Result<(), String> {
    ps::command("mmc.exe")
        .arg("devmgmt.msc")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("No se pudo abrir el Administrador de dispositivos: {e}"))
}

/// Guarda en una carpeta una copia de seguridad de los drivers instalados (pnputil export).
pub fn backup(dir: &str) -> Result<String, String> {
    let script = format!(
        r#"
$dir = {dir}
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$o = Invoke-Oem {{ pnputil.exe /export-driver * "$dir" }}
"@@OK|$dir"
"#,
        dir = q(dir)
    );
    let out = ps::run(&script)?;
    Ok(out.lines().last().unwrap_or("").replace("@@OK|", ""))
}
