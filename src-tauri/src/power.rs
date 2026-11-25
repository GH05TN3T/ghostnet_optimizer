//! Planes de energía (powercfg).

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};

pub const BALANCED: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";
pub const HIGH: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
pub const SAVER: &str = "a1841308-3541-4fab-bc81-f71556f20b4a";
pub const ULTIMATE: &str = "e9a42b02-d5df-448d-aa00-03f14749eb61";

#[derive(Serialize, Deserialize, Clone)]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub active: bool,
}

/// Ajustes que se muestran/editan en la vista previa.
/// (id, subgrupo, ajuste) — se usan alias de powercfg o GUIDs.
pub const SETTINGS: &[(&str, &str, &str)] = &[
    ("cpu_min", "SUB_PROCESSOR", "PROCTHROTTLEMIN"),
    ("cpu_max", "SUB_PROCESSOR", "PROCTHROTTLEMAX"),
    ("cpu_boost", "SUB_PROCESSOR", "PERFBOOSTMODE"),
    ("display_off", "SUB_VIDEO", "VIDEOIDLE"),
    ("sleep", "SUB_SLEEP", "STANDBYIDLE"),
    ("disk_off", "SUB_DISK", "DISKIDLE"),
    ("usb_suspend", "2a737441-1930-4402-8d77-b2bebba308a3", "48e6b7a6-50f5-4782-a5d4-53bb8f07e226"),
    ("pcie_aspm", "SUB_PCIEXPRESS", "ASPM"),
];

#[derive(Serialize, Deserialize, Clone)]
pub struct PlanSetting {
    pub id: String,
    pub ac: Option<u32>,
    pub dc: Option<u32>,
}

fn check_guid(g: &str) -> Result<(), String> {
    let ok = g.len() == 36 && g.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if ok { Ok(()) } else { Err("GUID de plan inválido".into()) }
}

pub fn list() -> Result<Vec<PowerPlan>, String> {
    // powercfg /list escribe en la página de códigos OEM; Invoke-Oem la decodifica bien.
    ps::run_json(
        r#"
$txt = Invoke-Oem { powercfg.exe /list }
$plans = @()
foreach ($line in ($txt -split "`r?`n")) {
  if ($line -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+\((.+)\)\s*(\*)?\s*$') {
    $plans += [pscustomobject]@{ guid = $matches[1].ToLower(); name = $matches[2]; active = [bool]$matches[3] }
  }
}
ConvertTo-Json -InputObject @($plans) -Compress
"#,
    )
}

pub fn set_active(guid: &str) -> Result<(), String> {
    check_guid(guid)?;
    ps::run(&format!("powercfg.exe /setactive {guid}; if ($LASTEXITCODE -ne 0) {{ throw 'powercfg no pudo activar el plan' }}")).map(|_| ())
}

/// Añade un plan integrado que falte (Máximo rendimiento u Alto rendimiento) y devuelve su GUID.
pub fn add_builtin(base: &str) -> Result<String, String> {
    check_guid(base)?;
    let out = ps::run(&format!("Invoke-Oem {{ powercfg.exe -duplicatescheme {base} }}"))?;
    let guid = out
        .split(|c: char| !(c.is_ascii_hexdigit() || c == '-'))
        .find(|w| w.len() == 36)
        .map(|s| s.to_lowercase())
        .ok_or_else(|| format!("Windows no permitió crear el plan: {out}"))?;
    Ok(guid)
}

pub fn delete(guid: &str) -> Result<(), String> {
    check_guid(guid)?;
    ps::run(&format!("powercfg.exe /delete {guid}; if ($LASTEXITCODE -ne 0) {{ throw 'No se puede borrar el plan activo ni los planes integrados' }}")).map(|_| ())
}

pub fn settings(guid: &str) -> Result<Vec<PlanSetting>, String> {
    check_guid(guid)?;
    let mut s = String::from("$res = @()\n");
    for (id, sub, setting) in SETTINGS {
        s += &format!(
            r#"$t = Invoke-Oem {{ powercfg.exe /query {guid} {sub} {setting} }}
$h = @([regex]::Matches($t, '0x[0-9a-fA-F]{{8}}') | ForEach-Object {{ $_.Value }})
if ($h.Count -ge 2) {{ $res += [pscustomobject]@{{ id = {id}; ac = [Convert]::ToUInt32($h[$h.Count-2], 16); dc = [Convert]::ToUInt32($h[$h.Count-1], 16) }} }}
else {{ $res += [pscustomobject]@{{ id = {id}; ac = $null; dc = $null }} }}
"#,
            id = q(id)
        );
    }
    s += "ConvertTo-Json -InputObject @($res) -Compress\n";
    ps::run_json(&s)
}

pub fn set_setting(guid: &str, id: &str, ac: u32, dc: u32) -> Result<(), String> {
    check_guid(guid)?;
    let (_, sub, setting) = SETTINGS
        .iter()
        .find(|(i, _, _)| *i == id)
        .ok_or("Ajuste desconocido")?;
    ps::run(&format!(
        "powercfg.exe /setacvalueindex {guid} {sub} {setting} {ac}
powercfg.exe /setdcvalueindex {guid} {sub} {setting} {dc}
$active = Invoke-Oem {{ powercfg.exe /getactivescheme }}
if ($active -match '{guid}') {{ powercfg.exe /setactive {guid} }}"
    ))
    .map(|_| ())
}

#[derive(Serialize, Deserialize)]
pub struct PowerStatus {
    /// Porcentaje de batería (None en sobremesa).
    pub battery: Option<u32>,
    pub plugged: bool,
    /// Temperatura de la zona térmica ACPI en °C (no todas las placas la exponen).
    pub temp: Option<f64>,
}

pub fn status() -> Result<PowerStatus, String> {
    ps::run_json(
        r#"
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$temp = $null
try {
  $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1
  if ($t) { $c = [math]::Round($t.CurrentTemperature / 10 - 273.15, 1); if ($c -gt 5 -and $c -lt 120) { $temp = $c } }
} catch { }
ConvertTo-Json -Compress -InputObject @{
  battery = $(if ($b) { [int]$b.EstimatedChargeRemaining } else { $null })
  plugged = $(if ($b) { $b.BatteryStatus -ne 1 } else { $true })
  temp = $temp
}
"#,
    )
}

pub fn open_settings() -> Result<(), String> {
    ps::command("control.exe")
        .arg("powercfg.cpl")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
