//! Programas de inicio: claves Run del registro y carpetas de Inicio.
//! Se activan/desactivan igual que el Administrador de tareas (claves StartupApproved),
//! así que los cambios también se ven allí y son reversibles.

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    pub command: String,
    pub source: String,
    pub enabled: bool,
}

const SOURCES: &[(&str, &str)] = &[
    ("HKCU", r"Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"),
    ("HKLM", r"Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"),
    ("HKLM32", r"Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32"),
    ("UserFolder", r"Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"),
    ("CommonFolder", r"Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"),
];

pub fn list() -> Result<Vec<StartupItem>, String> {
    ps::run_json(
        r#"
$items = @()
function Test-Approved($approved, $name) {
  try {
    $b = (Get-ItemProperty -LiteralPath $approved -Name $name -ErrorAction Stop).$name
    if ($b -and ($b[0] -band 1)) { return $false }
  } catch { }
  return $true
}
$runs = @(
  @{ src = 'HKCU';   path = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run';                 approved = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ src = 'HKLM';   path = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Run';              approved = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run' },
  @{ src = 'HKLM32'; path = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run';  approved = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32' }
)
foreach ($r in $runs) {
  if (Test-Path -LiteralPath $r.path) {
    $key = Get-Item -LiteralPath $r.path
    foreach ($n in $key.GetValueNames()) {
      if (-not $n) { continue }
      $items += [pscustomobject]@{ id = "$($r.src)|$n"; name = $n; command = [string]$key.GetValue($n); source = $r.src; enabled = (Test-Approved $r.approved $n) }
    }
  }
}
$folders = @(
  @{ src = 'UserFolder';   path = [Environment]::GetFolderPath('Startup');       approved = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' },
  @{ src = 'CommonFolder'; path = [Environment]::GetFolderPath('CommonStartup'); approved = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' }
)
foreach ($f in $folders) {
  if ($f.path -and (Test-Path -LiteralPath $f.path)) {
    foreach ($file in Get-ChildItem -LiteralPath $f.path -File -ErrorAction SilentlyContinue) {
      if ($file.Name -ieq 'desktop.ini') { continue }
      $items += [pscustomobject]@{ id = "$($f.src)|$($file.Name)"; name = [IO.Path]::GetFileNameWithoutExtension($file.Name); command = $file.FullName; source = $f.src; enabled = (Test-Approved $f.approved $file.Name) }
    }
  }
}
ConvertTo-Json -InputObject @($items) -Compress
"#,
    )
}

pub fn set(id: &str, enabled: bool) -> Result<(), String> {
    let (src, name) = id.split_once('|').ok_or("ID de inicio inválido")?;
    let approved = SOURCES
        .iter()
        .find(|(s, _)| *s == src)
        .map(|(_, p)| *p)
        .ok_or("Origen de inicio desconocido")?;
    let bytes = if enabled {
        "[byte[]]$b = @(2,0,0,0,0,0,0,0,0,0,0,0)".to_string()
    } else {
        "[byte[]]$b = @(3,0,0,0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime())".to_string()
    };
    ps::run(&format!(
        "{bytes}\nSet-Reg {} {} $b 'Binary'",
        q(approved),
        q(name)
    ))
    .map(|_| ())
}
