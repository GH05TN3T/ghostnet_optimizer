# GhostNet Builder: crea una ISO de Windows 11 sin bloatware a partir de una ISO oficial.
#
# Usa solo herramientas de Windows (DISM / módulo Dism de PowerShell, reg, takeown, icacls)
# y oscdimg.exe de Microsoft para generar la ISO. No modifica el sistema en el que se ejecuta:
# todo ocurre dentro de una carpeta de trabajo y se limpia al terminar.
#
# Variables que pone la app antes de este script:
#   $Iso, $Out, $Index, $BuildProfile ('ligero' | 'gaming' | 'minimo'),
#   $Bypass, $LocalAccount, $DeepClean, $Esd (bool)
#
# Protocolo de salida (una línea cada una):
#   @@STEP|<n>|<texto>     comienza el paso n
#   @@LOG|<texto>          detalle
#   @@DONE|<ruta>|<bytes>  terminado

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$script:CurrentStep = 0
function Step([int]$n, [string]$t) { $script:CurrentStep = $n; [Console]::Out.WriteLine("@@STEP|$n|$t"); [Console]::Out.Flush() }
function Log([string]$t) { [Console]::Out.WriteLine("@@LOG|$t"); [Console]::Out.Flush() }

# Algunas claves de la imagen pertenecen a TrustedInstaller y ni un administrador puede
# escribir en ellas. Para esas, el builder toma posesión de la clave (solo dentro de la
# imagen montada, nunca en el Windows actual), se da permiso y reintenta.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GnPriv {
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr h, uint acc, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool LookupPrivilegeValue(string s, string n, out long luid);
  [StructLayout(LayoutKind.Sequential, Pack = 1)] struct TP { public int Count; public long Luid; public int Attr; }
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr t, bool d, ref TP n, int l, IntPtr p, IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static void Enable(string name) {
    IntPtr t;
    if (!OpenProcessToken(GetCurrentProcess(), 0x28, out t)) return;
    TP tp = new TP(); tp.Count = 1; tp.Attr = 2;
    if (LookupPrivilegeValue(null, name, out tp.Luid)) AdjustTokenPrivileges(t, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
    CloseHandle(t);
  }
}
"@
function Grant-RegAccess([string]$Path) {
  $sub = $Path -replace '^Registry::HKEY_LOCAL_MACHINE\\', ''
  if ($sub -notmatch '^z(SOFTWARE|SYSTEM|DEFAULT|NTUSER)') { return }   # solo hives de la imagen
  while ($sub -and -not (Test-Path -LiteralPath "Registry::HKEY_LOCAL_MACHINE\$sub")) { $sub = Split-Path $sub -Parent }
  if (-not $sub) { return }
  [GnPriv]::Enable('SeTakeOwnershipPrivilege'); [GnPriv]::Enable('SeRestorePrivilege')
  $admins = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
  $rights = [System.Security.AccessControl.RegistryRights]
  $k = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($sub, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights::TakeOwnership)
  $acl = $k.GetAccessControl([System.Security.AccessControl.AccessControlSections]::None)
  $acl.SetOwner($admins); $k.SetAccessControl($acl); $k.Close()
  $k = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($sub, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree, $rights::ChangePermissions)
  $acl = $k.GetAccessControl()
  $acl.SetAccessRule((New-Object System.Security.AccessControl.RegistryAccessRule($admins, 'FullControl', 'ContainerInherit', 'None', 'Allow')))
  $k.SetAccessControl($acl); $k.Close()
}
function Set-RegRaw([string]$Path, [string]$Name, $Value, [string]$Type) {
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -Path $Path -Force | Out-Null }
  New-ItemProperty -LiteralPath $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null
}
function Set-Reg([string]$Path, [string]$Name, $Value, [string]$Type = 'DWord') {
  try { Set-RegRaw $Path $Name $Value $Type }
  catch {
    try { Grant-RegAccess $Path; Set-RegRaw $Path $Name $Value $Type }
    catch { Log "  aviso: no se pudo aplicar $Name ($($_.Exception.Message))" }
  }
}
function Remove-Key([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Path) {
    try { Grant-RegAccess $Path; Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop }
    catch { Log "  aviso: no se pudo borrar $(Split-Path $Path -Leaf)" }
  }
}
function Invoke-Native([string]$Exe, [string[]]$ArgList) {
  $ErrorActionPreference = 'Continue'
  $out = & $Exe @ArgList 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "$Exe falló ($LASTEXITCODE): $($out.Trim())" }
  $out
}

# Carpeta de trabajo en la raíz de la unidad de salida (sin espacios: oscdimg los lleva mal).
$Work = (Split-Path -Qualifier $Out) + '\ghostnet_build'
$Src = Join-Path $Work 'iso'
$Mnt = Join-Path $Work 'mount'
$Hives = @()
$Mounted = $false
$IsoMounted = $false

function Load-Hives([string]$root) {
  $map = @{
    'zSOFTWARE' = "$root\Windows\System32\config\SOFTWARE"
    'zSYSTEM'   = "$root\Windows\System32\config\SYSTEM"
    'zDEFAULT'  = "$root\Windows\System32\config\default"
    'zNTUSER'   = "$root\Users\Default\ntuser.dat"
  }
  foreach ($k in $map.Keys) {
    if (Test-Path -LiteralPath $map[$k]) {
      Invoke-Native 'reg.exe' @('load', "HKLM\$k", $map[$k]) | Out-Null
      $script:Hives += $k
    }
  }
}
function Unload-Hives {
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
  foreach ($k in $script:Hives) {
    $ErrorActionPreference = 'Continue'
    for ($i = 0; $i -lt 5; $i++) {
      & reg.exe unload "HKLM\$k" 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) { break }
      Start-Sleep -Milliseconds 700; [GC]::Collect()
    }
  }
  $script:Hives = @()
}

# ---------------- Perfiles ----------------

$AppsCommon = @(
  'Clipchamp.Clipchamp', 'Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingSearch',
  'Microsoft.GetHelp', 'Microsoft.Getstarted', 'Microsoft.MicrosoftOfficeHub', 'Microsoft.MicrosoftSolitaireCollection',
  'Microsoft.People', 'Microsoft.PowerAutomateDesktop', 'Microsoft.Todos', 'Microsoft.WindowsAlarms',
  'microsoft.windowscommunicationsapps', 'Microsoft.WindowsFeedbackHub', 'Microsoft.WindowsMaps',
  'Microsoft.WindowsSoundRecorder', 'Microsoft.ZuneMusic', 'Microsoft.ZuneVideo', 'MicrosoftCorporationII.MicrosoftFamily',
  'MicrosoftCorporationII.QuickAssist', 'MicrosoftTeams', 'MSTeams', 'Microsoft.OutlookForWindows',
  'Microsoft.549981C3F5F10', 'Microsoft.Copilot', 'Microsoft.Windows.DevHome', 'Microsoft.YourPhone',
  'Microsoft.MixedReality.Portal', 'Microsoft.Microsoft3DViewer', 'Microsoft.SkypeApp', 'Microsoft.Wallet',
  'Microsoft.XboxApp', 'MicrosoftWindows.Client.WebExperience', 'MicrosoftWindows.CrossDevice'
)
$AppsMinimo = @(
  'Microsoft.GamingApp', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxGameOverlay', 'Microsoft.XboxIdentityProvider',
  'Microsoft.XboxSpeechToTextOverlay', 'Microsoft.Xbox.TCUI', 'Microsoft.WindowsStore', 'Microsoft.StorePurchaseApp',
  'Microsoft.WindowsCamera', 'Microsoft.MicrosoftStickyNotes', 'Microsoft.SecHealthUI', 'Microsoft.Edge.GameAssist',
  'Microsoft.Windows.Ai.Copilot.Provider', 'Microsoft.WidgetsPlatformRuntime'
)
$PackagesMinimo = @(
  'Microsoft-Windows-InternetExplorer-Optional-Package~', 'Microsoft-Windows-Kernel-LA57-FoD-Package~',
  'Microsoft-Windows-LanguageFeatures-Handwriting-', 'Microsoft-Windows-LanguageFeatures-OCR-',
  'Microsoft-Windows-LanguageFeatures-Speech-', 'Microsoft-Windows-LanguageFeatures-TextToSpeech-',
  'Microsoft-Windows-MediaPlayer-Package~', 'Microsoft-Windows-TabletPCMath-Package~',
  'Microsoft-Windows-Wallpaper-Content-Extended-FoD-Package~'
)

$apps = $AppsCommon
if ($BuildProfile -eq 'minimo') { $apps += $AppsMinimo }
$removeEdge = $BuildProfile -in @('gaming', 'minimo')
$removeOneDrive = $BuildProfile -in @('gaming', 'minimo')

try {
  # 1 ---------------------------------------------------------------
  Step 1 'Preparando la carpeta de trabajo'
  $drive = (Split-Path -Qualifier $Out)
  $free = (Get-PSDrive -Name $drive.TrimEnd(':')).Free
  if ($free -lt 20GB) { throw "Hacen falta al menos 20 GB libres en $drive (hay $([math]::Round($free / 1GB, 1)) GB)." }
  foreach ($m in @(Get-WindowsImage -Mounted -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Work*" })) {
    Log "Desmontando imagen antigua en $($m.Path)"
    Dismount-WindowsImage -Path $m.Path -Discard -ErrorAction SilentlyContinue | Out-Null
  }
  Clear-WindowsCorruptMountPoint -ErrorAction SilentlyContinue | Out-Null
  if (Test-Path -LiteralPath $Work) { Remove-Item -LiteralPath $Work -Recurse -Force }
  New-Item -ItemType Directory -Path $Src, $Mnt -Force | Out-Null

  # 2 ---------------------------------------------------------------
  Step 2 'Copiando el contenido de la ISO'
  $img = Mount-DiskImage -ImagePath $Iso -StorageType ISO -PassThru
  $IsoMounted = $true
  $letter = ($img | Get-Volume).DriveLetter
  if (-not $letter) { throw 'No se pudo montar la ISO.' }
  $isoRoot = "${letter}:\"
  $wimSrc = if (Test-Path "$isoRoot\sources\install.wim") { "$isoRoot\sources\install.wim" } elseif (Test-Path "$isoRoot\sources\install.esd") { "$isoRoot\sources\install.esd" } else { throw 'La ISO no tiene sources\install.wim ni install.esd: no parece una ISO de instalación de Windows.' }
  $ErrorActionPreference = 'Continue'
  & robocopy.exe $isoRoot $Src /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XF install.wim install.esd 2>&1 | Out-Null
  $rc = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($rc -ge 8) { throw "No se pudo copiar la ISO (robocopy $rc)." }
  Get-ChildItem -LiteralPath $Src -Recurse -Force | ForEach-Object { if (-not $_.PSIsContainer) { $_.IsReadOnly = $false } }

  # 3 ---------------------------------------------------------------
  Step 3 'Extrayendo la edición elegida'
  $wim = Join-Path $Src 'sources\install.wim'
  Export-WindowsImage -SourceImagePath $wimSrc -SourceIndex $Index -DestinationImagePath $wim -CompressionType Maximum -CheckIntegrity | Out-Null
  Dismount-DiskImage -ImagePath $Iso | Out-Null
  $IsoMounted = $false
  $info = Get-WindowsImage -ImagePath $wim -Index 1
  Log "$($info.ImageName) · compilación $($info.Version)"
  $arch = switch ($info.Architecture) { 9 { 'amd64' } 12 { 'arm64' } 0 { 'x86' } default { 'amd64' } }

  # 4 ---------------------------------------------------------------
  Step 4 'Montando la imagen'
  Mount-WindowsImage -ImagePath $wim -Index 1 -Path $Mnt | Out-Null
  $Mounted = $true

  # 5 ---------------------------------------------------------------
  Step 5 'Quitando apps preinstaladas'
  $prov = @(Get-AppxProvisionedPackage -Path $Mnt)
  foreach ($p in $prov) {
    if ($apps | Where-Object { $p.DisplayName -like $_ }) {
      Log "Quitando $($p.DisplayName)"
      try { Remove-AppxProvisionedPackage -Path $Mnt -PackageName $p.PackageName -ErrorAction Stop | Out-Null } catch { Log "  no se pudo: $($_.Exception.Message)" }
    }
  }

  if ($BuildProfile -eq 'minimo') {
    foreach ($pkg in @(Get-WindowsPackage -Path $Mnt)) {
      if ($PackagesMinimo | Where-Object { $pkg.PackageName -like "$_*" }) {
        Log "Quitando componente $($pkg.PackageName.Split('~')[0])"
        try { Remove-WindowsPackage -Path $Mnt -PackageName $pkg.PackageName -NoRestart -ErrorAction Stop | Out-Null } catch { Log "  no se pudo: $($_.Exception.Message)" }
      }
    }
  }

  # 6 ---------------------------------------------------------------
  Step 6 'Quitando Edge y OneDrive'
  $admins = '*S-1-5-32-544:F'
  if ($removeEdge) {
    # Solo el navegador. WebView2 (EdgeWebView) se conserva: muchas apps lo necesitan, incluida esta.
    foreach ($d in @("$Mnt\Program Files (x86)\Microsoft\Edge")) {
      if (Test-Path -LiteralPath $d) {
        Log 'Quitando Microsoft Edge (se conserva WebView2)'
        & takeown.exe /f $d /r /a 2>&1 | Out-Null
        & icacls.exe $d /grant $admins /t /c /q 2>&1 | Out-Null
        Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  } else { Log 'Edge se conserva en este perfil' }
  if ($removeOneDrive) {
    foreach ($f in @("$Mnt\Windows\System32\OneDriveSetup.exe", "$Mnt\Windows\SysWOW64\OneDriveSetup.exe")) {
      if (Test-Path -LiteralPath $f) {
        Log 'Quitando el instalador de OneDrive'
        & takeown.exe /f $f /a 2>&1 | Out-Null
        & icacls.exe $f /grant $admins /c /q 2>&1 | Out-Null
        Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
      }
    }
  } else { Log 'OneDrive se conserva en este perfil' }

  # 7 ---------------------------------------------------------------
  Step 7 'Aplicando ajustes al registro de la imagen'
  Load-Hives $Mnt
  $SW = 'Registry::HKEY_LOCAL_MACHINE\zSOFTWARE'
  $SY = 'Registry::HKEY_LOCAL_MACHINE\zSYSTEM'
  $DU = 'Registry::HKEY_LOCAL_MACHINE\zNTUSER'
  $DF = 'Registry::HKEY_LOCAL_MACHINE\zDEFAULT'
  $svc = "$SY\ControlSet001\Services"

  if ($Bypass) {
    Log 'Saltar requisitos de hardware (TPM, CPU, RAM, Secure Boot)'
    foreach ($h in @($DU, $DF)) { Set-Reg "$h\Control Panel\UnsupportedHardwareNotificationCache" 'SV1' 0; Set-Reg "$h\Control Panel\UnsupportedHardwareNotificationCache" 'SV2' 0 }
    foreach ($n in 'BypassCPUCheck', 'BypassRAMCheck', 'BypassSecureBootCheck', 'BypassStorageCheck', 'BypassTPMCheck') { Set-Reg "$SY\Setup\LabConfig" $n 1 }
    Set-Reg "$SY\Setup\MoSetup" 'AllowUpgradesWithUnsupportedTPMOrCPU' 1
  }
  if ($LocalAccount) {
    Log 'Permitir cuenta local sin Internet'
    Set-Reg "$SW\Microsoft\Windows\CurrentVersion\OOBE" 'BypassNRO' 1
  }

  Log 'Sin apps patrocinadas ni sugerencias'
  $cdm = "$DU\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager"
  foreach ($n in 'OemPreInstalledAppsEnabled', 'PreInstalledAppsEnabled', 'PreInstalledAppsEverEnabled', 'SilentInstalledAppsEnabled', 'ContentDeliveryAllowed', 'FeatureManagementEnabled', 'SoftLandingEnabled', 'SubscribedContentEnabled', 'SystemPaneSuggestionsEnabled', 'SubscribedContent-310093Enabled', 'SubscribedContent-338387Enabled', 'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled', 'SubscribedContent-338393Enabled', 'SubscribedContent-353694Enabled', 'SubscribedContent-353696Enabled', 'RotatingLockScreenOverlayEnabled') { Set-Reg $cdm $n 0 }
  Set-Reg "$SW\Policies\Microsoft\Windows\CloudContent" 'DisableWindowsConsumerFeatures' 1
  Set-Reg "$SW\Policies\Microsoft\Windows\CloudContent" 'DisableConsumerAccountStateContent' 1
  Set-Reg "$SW\Microsoft\PolicyManager\current\device\Start" 'ConfigureStartPins' '{"pinnedList": [{}]}' 'String'
  Set-Reg "$SW\Microsoft\Windows\CurrentVersion\Communications" 'ConfigureChatAutoInstall' 0
  Remove-Key "$SW\Microsoft\WindowsUpdate\Orchestrator\UScheduler_Oobe\OutlookUpdate"
  Remove-Key "$SW\Microsoft\WindowsUpdate\Orchestrator\UScheduler_Oobe\DevHomeUpdate"
  Set-Reg "$SW\Policies\Microsoft\Dsh" 'AllowNewsAndInterests' 0

  Log 'Telemetría al mínimo'
  Set-Reg "$SW\Policies\Microsoft\Windows\DataCollection" 'AllowTelemetry' 0
  Set-Reg "$SW\Microsoft\Windows\CurrentVersion\Policies\DataCollection" 'AllowTelemetry' 0
  Set-Reg "$DU\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo" 'Enabled' 0
  Set-Reg "$DU\Software\Microsoft\Windows\CurrentVersion\Privacy" 'TailoredExperiencesWithDiagnosticDataEnabled' 0
  Set-Reg "$DU\Software\Microsoft\Windows\CurrentVersion\Search" 'BingSearchEnabled' 0
  Set-Reg "$DU\Software\Policies\Microsoft\Windows\Explorer" 'DisableSearchBoxSuggestions' 1
  foreach ($s in 'DiagTrack', 'dmwappushservice') { if (Test-Path "$svc\$s") { Set-Reg "$svc\$s" 'Start' 4 } }

  Log 'Copilot y Recall desactivados'
  Set-Reg "$SW\Policies\Microsoft\Windows\WindowsCopilot" 'TurnOffWindowsCopilot' 1
  Set-Reg "$DU\Software\Policies\Microsoft\Windows\WindowsCopilot" 'TurnOffWindowsCopilot' 1
  Set-Reg "$SW\Policies\Microsoft\Windows\WindowsAI" 'DisableAIDataAnalysis' 1

  if ($BuildProfile -in @('gaming', 'minimo')) {
    Log 'Sin almacenamiento reservado (≈7 GB más libres)'
    Set-Reg "$SW\Microsoft\Windows\CurrentVersion\ReserveManager" 'ShippedWithReserves' 0
    Log 'Ajustes para juegos'
    Set-Reg "$DU\System\GameConfigStore" 'GameDVR_Enabled' 0
    Set-Reg "$SW\Policies\Microsoft\Windows\GameDVR" 'AllowGameDVR' 0
    Set-Reg "$DU\Software\Microsoft\GameBar" 'AutoGameModeEnabled' 1
    Set-Reg "$DU\Control Panel\Mouse" 'MouseSpeed' '0' 'String'
    Set-Reg "$DU\Control Panel\Mouse" 'MouseThreshold1' '0' 'String'
    Set-Reg "$DU\Control Panel\Mouse" 'MouseThreshold2' '0' 'String'
    $mm = "$SW\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
    Set-Reg $mm 'NetworkThrottlingIndex' -1
    Set-Reg $mm 'SystemResponsiveness' 10
    Set-Reg "$mm\Tasks\Games" 'GPU Priority' 8
    Set-Reg "$mm\Tasks\Games" 'Priority' 6
    Set-Reg "$mm\Tasks\Games" 'Scheduling Category' 'High' 'String'
    Set-Reg "$mm\Tasks\Games" 'SFIO Priority' 'High' 'String'
    Set-Reg "$DU\Control Panel\Accessibility\StickyKeys" 'Flags' '506' 'String'
    Set-Reg "$DU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" 'HideFileExt' 0
    if ($removeOneDrive) {
      try { Remove-ItemProperty -LiteralPath "$DU\Software\Microsoft\Windows\CurrentVersion\Run" -Name 'OneDriveSetup' -ErrorAction Stop } catch { }
    }
    if ($removeEdge) {
      Set-Reg "$SW\Microsoft\EdgeUpdate" 'DoNotUpdateToEdgeWithChromium' 1
    }
  }

  if ($BuildProfile -eq 'minimo') {
    Log 'Perfil Mínimo: Windows Update y Defender desactivados'
    foreach ($s in 'wuauserv', 'UsoSvc', 'WaaSMedicSvc', 'WinDefend', 'WdNisSvc', 'WdNisDrv', 'WdFilter', 'WdBoot', 'Sense', 'SecurityHealthService') {
      if (Test-Path "$svc\$s") { Set-Reg "$svc\$s" 'Start' 4 }
    }
    Set-Reg "$SW\Policies\Microsoft\Windows\WindowsUpdate\AU" 'NoAutoUpdate' 1
    Set-Reg "$SW\Policies\Microsoft\Windows Defender" 'DisableAntiSpyware' 1
    Set-Reg "$SW\Policies\Microsoft\Windows\System" 'EnableSmartScreen' 0
    Set-Reg "$SW\Policies\Microsoft\WindowsStore" 'RemoveWindowsStore' 1
  }
  Unload-Hives

  # 8 ---------------------------------------------------------------
  Step 8 'Limpiando componentes de la imagen'
  if ($DeepClean) {
    Log 'DISM /StartComponentCleanup /ResetBase (tarda varios minutos)'
    try { Invoke-Native 'dism.exe' @("/Image:$Mnt", '/Cleanup-Image', '/StartComponentCleanup', '/ResetBase') | Out-Null }
    catch { Log "  aviso: la limpieza profunda no se pudo completar; la ISO quedará algo más grande ($($_.Exception.Message))" }
  } else { Log 'Omitido' }

  # 9 ---------------------------------------------------------------
  Step 9 'Guardando la imagen'
  Dismount-WindowsImage -Path $Mnt -Save | Out-Null
  $Mounted = $false
  if ($Esd) {
    Log 'Comprimiendo a install.esd (máxima compresión, tarda bastante)'
    $esd = Join-Path $Src 'sources\install.esd'
    Export-WindowsImage -SourceImagePath $wim -SourceIndex 1 -DestinationImagePath $esd -CompressionType Recovery | Out-Null
    Remove-Item -LiteralPath $wim -Force
  } else {
    $tmp = Join-Path $Work 'install_tmp.wim'
    Export-WindowsImage -SourceImagePath $wim -SourceIndex 1 -DestinationImagePath $tmp -CompressionType Maximum | Out-Null
    Move-Item -LiteralPath $tmp -Destination $wim -Force
  }

  # 10 --------------------------------------------------------------
  Step 10 'Preparando el instalador (boot.wim)'
  $boot = Join-Path $Src 'sources\boot.wim'
  if ($Bypass -and (Test-Path -LiteralPath $boot)) {
    Mount-WindowsImage -ImagePath $boot -Index 2 -Path $Mnt | Out-Null
    $Mounted = $true
    Invoke-Native 'reg.exe' @('load', 'HKLM\zSYSTEM', "$Mnt\Windows\System32\config\SYSTEM") | Out-Null
    $script:Hives = @('zSYSTEM')
    foreach ($n in 'BypassCPUCheck', 'BypassRAMCheck', 'BypassSecureBootCheck', 'BypassStorageCheck', 'BypassTPMCheck') { Set-Reg 'Registry::HKEY_LOCAL_MACHINE\zSYSTEM\Setup\LabConfig' $n 1 }
    Unload-Hives
    Dismount-WindowsImage -Path $Mnt -Save | Out-Null
    $Mounted = $false
  }
  if ($LocalAccount) {
    $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="$arch" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <ProtectYourPC>3</ProtectYourPC>
      </OOBE>
    </component>
  </settings>
</unattend>
"@
    Set-Content -LiteralPath (Join-Path $Src 'autounattend.xml') -Value $xml -Encoding UTF8
  }

  # 11 --------------------------------------------------------------
  Step 11 'Creando la ISO'
  $osc = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe",
    (Join-Path $env:LOCALAPPDATA 'GhostNet\oscdimg.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $osc) {
    Log 'Descargando oscdimg.exe desde el servidor de Microsoft'
    $osc = Join-Path $env:LOCALAPPDATA 'GhostNet\oscdimg.exe'
    New-Item -ItemType Directory -Path (Split-Path $osc) -Force | Out-Null
    $ok = $false
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri 'https://msdl.microsoft.com/download/symbols/oscdimg.exe/3D44737265000/oscdimg.exe' -OutFile $osc -UseBasicParsing
      $sig = Get-AuthenticodeSignature -LiteralPath $osc
      $ok = ($sig.Status -eq 'Valid' -and $sig.SignerCertificate.Subject -match 'Microsoft')
    } catch { Log "  descarga directa falló: $($_.Exception.Message)" }
    if (-not $ok) {
      Remove-Item -LiteralPath $osc -Force -ErrorAction SilentlyContinue
      Log 'Instalando las Deployment Tools del Windows ADK con winget (solo oscdimg y DISM)'
      $ErrorActionPreference = 'Continue'
      & winget.exe install --id Microsoft.WindowsADK -e --silent --accept-package-agreements --accept-source-agreements --override '/features OptionId.DeploymentTools /quiet /norestart' 2>&1 | Out-Null
      $ErrorActionPreference = 'Stop'
      $osc = "${env:ProgramFiles(x86)}\Windows Kits\10\Assessment and Deployment Kit\Deployment Tools\amd64\Oscdimg\oscdimg.exe"
      if (-not (Test-Path -LiteralPath $osc)) { throw 'No se encontró oscdimg.exe. Instala "Windows ADK" (Deployment Tools) y vuelve a intentarlo.' }
    }
  }
  $etfs = Join-Path $Src 'boot\etfsboot.com'
  $efi = Join-Path $Src 'efi\microsoft\boot\efisys.bin'
  $bootdata = if (Test-Path -LiteralPath $etfs) { "2#p0,e,b$etfs#pEF,e,b$efi" } else { "1#pEF,e,b$efi" }
  if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
  $label = 'GHOSTNET_W11'
  Invoke-Native $osc @('-m', '-o', '-u2', '-udfver102', "-l$label", "-bootdata:$bootdata", $Src, $Out) | Out-Null

  # 12 --------------------------------------------------------------
  Step 12 'Limpiando archivos temporales'
  Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
  $size = (Get-Item -LiteralPath $Out).Length
  [Console]::Out.WriteLine("@@DONE|$Out|$size"); [Console]::Out.Flush()
}
catch {
  $msg = ($_.Exception.Message -replace '\s+', ' ').Trim()
  [Console]::Out.WriteLine("@@ERROR|Paso $($script:CurrentStep): $msg"); [Console]::Out.Flush()
}
finally {
  if ($Hives.Count) { Unload-Hives }
  if ($Mounted) { Dismount-WindowsImage -Path $Mnt -Discard -ErrorAction SilentlyContinue | Out-Null }
  if ($IsoMounted) { Dismount-DiskImage -ImagePath $Iso -ErrorAction SilentlyContinue | Out-Null }
}
