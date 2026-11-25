//! Descarga de la ISO oficial de Windows 11 directamente desde los servidores de Microsoft.
//!
//! Usa el mismo flujo que la web de descarga de Microsoft (y que Fido, el script de Rufus):
//! 1. Se registra un ID de sesión (vlscppe + ov-df), que Microsoft exige antes de dar enlaces.
//! 2. Se piden los idiomas disponibles de la edición actual (getskuinformationbyproductedition).
//! 3. Se pide el enlace de la ISO x64 para el idioma elegido (GetProductDownloadLinksBySku).
//! 4. Se descarga con BITS (el gestor de descargas de Windows: reanudable y con progreso).

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static RUNNING: Mutex<Option<u32>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone)]
pub struct Language {
    pub id: String,
    pub name: String,
    pub display: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Languages {
    pub session: String,
    pub languages: Vec<Language>,
}

/// Funciones comunes de los dos scripts.
const COMMON: &str = r#"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProfileId = '606624d44113'
$OrgId = 'y6jn8c31'
$InstanceId = '560dc9f3-1aa5-4a2f-b63c-9e18f8d0e175'
$Referer = 'https://www.microsoft.com/software-download/windows11'
function Get-Json([string]$url) {
  Invoke-RestMethod -Headers @{ Referer = $Referer } -UseBasicParsing -TimeoutSec 30 $url
}
function Blocked-Message {
  'Microsoft ha bloqueado temporalmente la descarga automática desde tu conexión (código 715-123130). Suele pasar con VPN o tras muchos intentos: prueba más tarde o descárgala desde su web.'
}
"#;

pub fn languages() -> Result<Languages, String> {
    let script = format!(
        r#"{COMMON}
$session = [guid]::NewGuid().ToString()
# 1) Registrar la sesión (Microsoft lo exige antes de dar enlaces).
try {{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 "https://vlscppe.microsoft.com/tags?org_id=$OrgId&session_id=$session" | Out-Null }} catch {{ }}
try {{
  $mdt = Invoke-RestMethod -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 "https://ov-df.microsoft.com/mdt.js?instanceId=$InstanceId&PageId=si&session_id=$session"
  if ($mdt -match '[?&]w=([A-F0-9]+)') {{ $w = $matches[1] }}
  if ($mdt -match 'rticks\=\"\+?(\d+)') {{ $rticks = $matches[1] }}
  if ($w -and $rticks) {{
    $now = [DateTimeOffset]::Now.ToUnixTimeMilliSeconds()
    try {{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 0 "https://ov-df.microsoft.com/?session_id=$session&CustomerId=$InstanceId&PageId=si&w=$w&mdt=$now&rticks=$rticks" | Out-Null }} catch {{ }}
  }}
}} catch {{ }}

# 2) Edición actual: se lee de la página de descarga (con respaldo por si cambia el formato).
$ids = @()
try {{
  $page = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 'https://www.microsoft.com/en-us/software-download/windows11'
  $ids = @([regex]::Matches($page.Content, '<option value="(\d+)"') | ForEach-Object {{ $_.Groups[1].Value }} | Select-Object -Unique)
}} catch {{ }}
$ids += '3813'

$langs = @()
$lastError = $null
foreach ($id in ($ids | Select-Object -Unique)) {{
  for ($attempt = 0; $attempt -lt 3 -and -not $langs.Count; $attempt++) {{
    if ($attempt) {{ Start-Sleep -Seconds 2 }}
    try {{
      $r = Get-Json "https://www.microsoft.com/software-download-connector/api/getskuinformationbyproductedition?profile=$ProfileId&productEditionId=$id&SKU=undefined&friendlyFileName=undefined&Locale=en-US&sessionID=$session"
      if ($r.Errors) {{ $lastError = if ($r.Errors[0].Type -eq 9) {{ Blocked-Message }} else {{ [string]$r.Errors[0].Value }}; continue }}
      foreach ($s in $r.Skus) {{ $langs += [ordered]@{{ id = [string]$s.Id; name = [string]$s.Language; display = [string]$s.LocalizedLanguage }} }}
    }} catch {{ $lastError = $_.Exception.Message }}
  }}
  if ($langs.Count) {{ break }}
}}
if (-not $langs.Count) {{ throw ($(if ($lastError) {{ $lastError }} else {{ 'Microsoft no devolvió idiomas disponibles.' }})) }}
ConvertTo-Json -Compress -Depth 4 -InputObject ([ordered]@{{ session = $session; languages = @($langs | Sort-Object {{ $_.display }}) }})
"#
    );
    ps::run_json(&script)
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Event {
    File { path: String },
    Progress { done: u64, total: u64 },
    Done { path: String, size: u64 },
    Error { text: String },
    End,
}

fn safe_id(s: &str) -> bool {
    !s.is_empty() && s.len() < 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub fn start(app: AppHandle, sku: String, session: String, dir: String) -> Result<(), String> {
    if !safe_id(&sku) || !safe_id(&session) {
        return Err("Datos de descarga inválidos".into());
    }
    if dir.contains('\n') || dir.len() < 3 {
        return Err("Carpeta inválida".into());
    }
    let mut running = RUNNING.lock().map_err(|e| e.to_string())?;
    if running.is_some() {
        return Err("Ya hay una descarga en marcha".into());
    }
    let script = format!(
        r#"$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Emit([string]$t) {{ [Console]::Out.WriteLine($t); [Console]::Out.Flush() }}
{COMMON}
$Dir = {dir}
$r = Get-Json "https://www.microsoft.com/software-download-connector/api/GetProductDownloadLinksBySku?profile=$ProfileId&productEditionId=undefined&SKU={sku}&friendlyFileName=undefined&Locale=en-US&sessionID={session}"
if ($r.Errors) {{ if ($r.Errors[0].Type -eq 9) {{ throw (Blocked-Message) }} else {{ throw [string]$r.Errors[0].Value }} }}
$opt = @($r.ProductDownloadOptions | Where-Object {{ $_.DownloadType -eq 1 }}) | Select-Object -First 1
if (-not $opt) {{ throw 'Microsoft no ofreció la ISO de 64 bits para ese idioma.' }}
$url = [string]$opt.Uri
$name = [regex]::Match($url, '/([^/?]+\.iso)').Groups[1].Value
if (-not $name) {{ $name = 'Windows11_x64.iso' }}
if (-not (Test-Path -LiteralPath $Dir)) {{ New-Item -ItemType Directory -Path $Dir -Force | Out-Null }}
$dest = Join-Path $Dir $name
$drive = (Split-Path -Qualifier $dest).TrimEnd(':')
if ((Get-PSDrive -Name $drive).Free -lt 8GB) {{ throw "Hacen falta al menos 8 GB libres en $($drive):" }}
Emit "@@FILE|$dest"
Get-BitsTransfer -ErrorAction SilentlyContinue | Where-Object {{ $_.DisplayName -eq 'GhostNetISO' }} | Remove-BitsTransfer -ErrorAction SilentlyContinue
$job = Start-BitsTransfer -Source $url -Destination $dest -Asynchronous -DisplayName 'GhostNetISO' -Priority Foreground
while ($true) {{
  switch ([string]$job.JobState) {{
    'Transferred' {{ Complete-BitsTransfer -BitsJob $job; $size = (Get-Item -LiteralPath $dest).Length; Emit "@@DONE|$dest|$size"; return }}
    'Error' {{ $msg = $job.ErrorDescription; Remove-BitsTransfer -BitsJob $job; throw "La descarga falló: $msg" }}
    'Cancelled' {{ throw 'Descarga cancelada' }}
  }}
  Emit "@@PCT|$($job.BytesTransferred)|$($job.BytesTotal)"
  Start-Sleep -Milliseconds 800
}}
"#,
        dir = q(&dir),
        sku = sku,
        session = session
    );
    let path = std::env::temp_dir().join(format!("ghostnet_isodl_{}.ps1", std::process::id()));
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
            let _ = app.emit("isodl", e);
        };
        let mut done = false;
        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let mut p = line.trim_end().split('|');
                match p.next() {
                    Some("@@FILE") => emit(Event::File { path: p.collect::<Vec<_>>().join("|") }),
                    Some("@@PCT") => {
                        let done_b = p.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                        let total = p.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                        // BITS devuelve u64::MAX como total mientras no lo conoce.
                        let total = if total == u64::MAX { 0 } else { total };
                        emit(Event::Progress { done: done_b, total });
                    }
                    Some("@@DONE") => {
                        let path = p.next().unwrap_or_default().to_string();
                        let size = p.next().and_then(|v| v.parse().ok()).unwrap_or(0);
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
        let _ = child.wait();
        let cancelled = RUNNING.lock().map(|r| r.is_none()).unwrap_or(false);
        if !done && !cancelled {
            let msg = err
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty() && !l.starts_with('+') && !l.starts_with("At ") && !l.starts_with("En ") && !l.contains("CategoryInfo") && !l.contains("FullyQualifiedErrorId"))
                .collect::<Vec<_>>()
                .join(" ");
            emit(Event::Error { text: if msg.is_empty() { "La descarga se interrumpió.".into() } else { msg } });
        }
        if let Ok(mut r) = RUNNING.lock() {
            *r = None;
        }
        let _ = std::fs::remove_file(&path);
        emit(Event::End);
    });
    Ok(())
}

pub fn cancel() -> Result<(), String> {
    if let Some(pid) = RUNNING.lock().map_err(|e| e.to_string())?.take() {
        let _ = ps::command("taskkill.exe").args(["/PID", &pid.to_string(), "/T", "/F"]).output();
    }
    ps::run("Get-BitsTransfer -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'GhostNetISO' } | Remove-BitsTransfer -ErrorAction SilentlyContinue")
        .map(|_| ())
}
