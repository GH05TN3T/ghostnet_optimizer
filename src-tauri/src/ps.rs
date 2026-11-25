//! Ejecución de scripts de PowerShell (Windows PowerShell 5.1, que viene en todo Windows 10/11).
//!
//! Cada script se escribe a un .ps1 temporal con BOM UTF-8 y se ejecuta con `-File`,
//! así no hay límite de longitud de línea de comandos ni problemas de comillas.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Funciones auxiliares disponibles en todos los scripts.
pub const PRELUDE: &str = r#"$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Set-Reg([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord') {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -LiteralPath $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}
function Get-Reg([string]$Path, [string]$Name) {
  try { (Get-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction Stop).$Name } catch { $null }
}
function Del-Reg([string]$Path, [string]$Name) {
  if (Test-Path -LiteralPath $Path) { Remove-ItemProperty -LiteralPath $Path -Name $Name -ErrorAction SilentlyContinue }
}
function Invoke-Oem([scriptblock]$Block) {
  # Ejecuta un comando nativo (powercfg, compact, dism...) decodificando su salida
  # con la página de códigos OEM, para que los acentos no salgan rotos.
  $ErrorActionPreference = 'Continue'
  $oem = [Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
  [Console]::OutputEncoding = $oem
  try { $t = (& $Block 2>&1 | Out-String) } finally { [Console]::OutputEncoding = [Text.Encoding]::UTF8 }
  $t
}
"#;

/// Escapa un texto para meterlo entre comillas simples de PowerShell.
pub fn q(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

fn temp_script() -> PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    std::env::temp_dir().join(format!("optimizador_{}_{}.ps1", std::process::id(), n))
}

pub fn command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Ejecuta un script (con el PRELUDE delante) y devuelve la salida estándar.
pub fn run(script: &str) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("Esta herramienta solo funciona en Windows.".into());
    }
    let path = temp_script();
    {
        let mut f = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        f.write_all(&[0xEF, 0xBB, 0xBF]).map_err(|e| e.to_string())?;
        f.write_all(PRELUDE.as_bytes()).map_err(|e| e.to_string())?;
        f.write_all(b"\r\n").map_err(|e| e.to_string())?;
        f.write_all(script.as_bytes()).map_err(|e| e.to_string())?;
    }
    let out = command("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&path)
        .stdin(Stdio::null())
        .output();
    let _ = std::fs::remove_file(&path);
    let out = out.map_err(|e| format!("No se pudo iniciar PowerShell: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(clean_error(if stderr.is_empty() { &stdout } else { &stderr }))
    }
}

/// Ejecuta y parsea la salida como JSON.
pub fn run_json<T: serde::de::DeserializeOwned>(script: &str) -> Result<T, String> {
    let out = run(script)?;
    // Por si algún comando escribió algo antes del JSON, buscamos el primer '{' o '['.
    let start = out.find(|c| c == '{' || c == '[').unwrap_or(0);
    serde_json::from_str(&out[start..]).map_err(|e| format!("Respuesta inválida de PowerShell: {e}"))
}

/// Quita el ruido típico de los errores de PowerShell (líneas "At line:", "+ CategoryInfo"...).
fn clean_error(s: &str) -> String {
    let lines: Vec<&str> = s
        .lines()
        .map(|l| l.trim())
        .filter(|l| {
            !l.is_empty()
                && !l.starts_with('+')
                && !l.starts_with("At ")
                && !l.starts_with("En ")
                && !l.starts_with("CategoryInfo")
                && !l.starts_with("FullyQualifiedErrorId")
        })
        .collect();
    let msg = lines.join(" ");
    if msg.is_empty() {
        "Error desconocido de PowerShell".into()
    } else {
        msg
    }
}
