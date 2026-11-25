//! Juegos instalados (Steam, Epic, Rockstar, FiveM) y optimización por juego:
//! - GPU de alto rendimiento (Configuración > Pantalla > Gráficos)
//! - Desactivar optimizaciones de pantalla completa para ese .exe
//! - Prioridad de CPU alta al abrirse (Image File Execution Options)
//! Todo es reversible y solo afecta al .exe de ese juego.

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Game {
    pub name: String,
    pub source: String,
    pub exe: String,
    pub optimized: bool,
}

pub fn list() -> Result<Vec<Game>, String> {
    ps::run_json(
        r#"
$games = @()
$skip = 'unins|setup|crash|report|redist|vc_|dxsetup|prereq|easyanticheat|battleye|eac|launcher|helper|install|update|cef|overlay|dotnet|vcredist|benchmark'
function Find-Exe([string]$dir) {
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { return $null }
  $e = Get-ChildItem -LiteralPath $dir -Filter *.exe -Recurse -Depth 4 -File -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -notmatch $skip } | Sort-Object Length -Descending | Select-Object -First 1
  if ($e) { $e.FullName } else { $null }
}
function Add-Game($name, $source, $exe) {
  if ($exe -and (Test-Path -LiteralPath $exe)) {
    $script:games += [pscustomobject]@{ name = [string]$name; source = $source; exe = [string]$exe; optimized = $false }
  }
}

# Steam
$steam = Get-Reg 'Registry::HKEY_CURRENT_USER\Software\Valve\Steam' 'SteamPath'
if ($steam) {
  $steam = $steam -replace '/', '\'
  $libs = @($steam)
  $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
  if (Test-Path -LiteralPath $vdf) {
    foreach ($m in [regex]::Matches((Get-Content -Raw -LiteralPath $vdf), '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\', '\') }
  }
  foreach ($lib in ($libs | Select-Object -Unique)) {
    $apps = Join-Path $lib 'steamapps'
    foreach ($acf in Get-ChildItem -LiteralPath $apps -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue) {
      $t = Get-Content -Raw -LiteralPath $acf.FullName
      $n = [regex]::Match($t, '"name"\s+"([^"]+)"').Groups[1].Value
      $d = [regex]::Match($t, '"installdir"\s+"([^"]+)"').Groups[1].Value
      if (-not $n -or $n -match 'Steamworks|Redistributable|Proton|Runtime|SDK|Dedicated Server') { continue }
      Add-Game $n 'Steam' (Find-Exe (Join-Path $apps "common\$d"))
    }
  }
}

# Epic Games
$epic = Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
foreach ($item in Get-ChildItem -LiteralPath $epic -Filter *.item -ErrorAction SilentlyContinue) {
  try {
    $j = Get-Content -Raw -LiteralPath $item.FullName | ConvertFrom-Json
    if ($j.bIsApplication -eq $false) { continue }
    $exe = if ($j.LaunchExecutable) { Join-Path $j.InstallLocation $j.LaunchExecutable } else { Find-Exe $j.InstallLocation }
    Add-Game $j.DisplayName 'Epic' $exe
  } catch { }
}

# GTA V (Rockstar) y FiveM
$gta = Get-Reg 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V' 'InstallFolder'
if ($gta -and -not ($games | Where-Object { $_.exe -like "*\GTA5.exe" })) { Add-Game 'Grand Theft Auto V' 'Rockstar' (Join-Path $gta 'GTA5.exe') }
Add-Game 'FiveM' 'FiveM' (Join-Path $env:LOCALAPPDATA 'FiveM\FiveM.exe')

$gpu = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\DirectX\UserGpuPreferences'
foreach ($g in $games) {
  $v = Get-Reg $gpu $g.exe
  $g.optimized = [bool]($v -and $v -match 'GpuPreference=2')
}
ConvertTo-Json -InputObject @($games | Sort-Object name) -Compress
"#,
    )
}

pub fn optimize(exe: &str, enable: bool) -> Result<(), String> {
    if !exe.to_lowercase().ends_with(".exe") || exe.contains('\n') {
        return Err("Ruta de juego inválida".into());
    }
    let name = exe.rsplit('\\').next().unwrap_or(exe);
    let ifeo = format!(
        r"Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\{name}\PerfOptions"
    );
    let gpu = r"Registry::HKEY_CURRENT_USER\Software\Microsoft\DirectX\UserGpuPreferences";
    let layers = r"Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
    let script = if enable {
        format!(
            "Set-Reg {gpu} {exe} 'GpuPreference=2;' 'String'
Set-Reg {layers} {exe} '~ DISABLEDXMAXIMIZEDWINDOWEDMODE' 'String'
Set-Reg {ifeo} 'CpuPriorityClass' 3",
            gpu = q(gpu),
            layers = q(layers),
            ifeo = q(&ifeo),
            exe = q(exe)
        )
    } else {
        format!(
            "Del-Reg {gpu} {exe}
Del-Reg {layers} {exe}
Del-Reg {ifeo} 'CpuPriorityClass'",
            gpu = q(gpu),
            layers = q(layers),
            ifeo = q(&ifeo),
            exe = q(exe)
        )
    };
    ps::run(&script).map(|_| ())
}
