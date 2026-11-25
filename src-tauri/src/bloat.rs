//! Debloat: apps preinstaladas que se pueden quitar.

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct BloatApp {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    pub category: &'static str,
    /// Patrón del paquete Appx (admite * al final/inicio). Vacío para casos especiales.
    #[serde(skip)]
    pub pkg: &'static str,
    pub risk: Option<&'static str>,
    pub installed: bool,
}

const fn app(
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    category: &'static str,
    pkg: &'static str,
    risk: Option<&'static str>,
) -> BloatApp {
    BloatApp { id, name, desc, category, pkg, risk, installed: false }
}

const IA: &str = "Microsoft e IA";
const XBOX: &str = "Xbox y juegos";
const UTIL: &str = "Utilidades de Windows";
const PROMO: &str = "Promocionales";

pub const CATALOG: &[BloatApp] = &[
    app("copilot", "Copilot", "Asistente de IA de Microsoft.", IA, "Microsoft.Copilot", None),
    app("onedrive", "OneDrive", "Sincronización en la nube. Tus archivos se quedan en la carpeta OneDrive.", IA, "", None),
    app("teams", "Microsoft Teams", "Teams personal / Chat.", IA, "MSTeams", None),
    app("teams_old", "Teams (versión antigua)", "Cliente consumidor antiguo de Teams.", IA, "MicrosoftTeams", None),
    app("outlook", "Outlook (nuevo)", "La app nueva de Outlook para Windows.", IA, "Microsoft.OutlookForWindows", None),
    app("mail", "Correo y Calendario", "Apps antiguas de correo y calendario.", IA, "microsoft.windowscommunicationsapps", None),
    app("office_hub", "Microsoft 365 (Office)", "Lanzador de Office que promociona la suscripción.", IA, "Microsoft.MicrosoftOfficeHub", None),
    app("cortana", "Cortana", "Asistente de voz antiguo.", IA, "Microsoft.549981C3F5F10", None),
    app("bing_search", "Búsqueda de Bing", "App de Bing integrada.", IA, "Microsoft.BingSearch", None),
    app("skype", "Skype", "Skype (descontinuado por Microsoft).", IA, "Microsoft.SkypeApp", None),
    app("people", "Contactos", "App Contactos.", IA, "Microsoft.People", None),
    app("todo", "Microsoft To Do", "Lista de tareas.", IA, "Microsoft.Todos", None),
    app("power_automate", "Power Automate", "Automatización de escritorio.", IA, "Microsoft.PowerAutomateDesktop", None),
    app("family", "Microsoft Family", "Control parental de Microsoft.", IA, "MicrosoftCorporationII.MicrosoftFamily", None),
    app("devhome", "Dev Home", "Panel para desarrolladores (descontinuado).", IA, "Microsoft.Windows.DevHome", None),

    app("xbox_app", "Xbox", "App de Xbox / Game Pass.", XBOX, "Microsoft.GamingApp", Some("Necesaria para juegos de Game Pass.")),
    app("xbox_old", "Xbox Console Companion", "App de Xbox antigua.", XBOX, "Microsoft.XboxApp", None),
    app("xbox_gamebar", "Xbox Game Bar", "Superposición Win+G y grabación.", XBOX, "Microsoft.XboxGamingOverlay", Some("Pierdes Win+G y su grabador.")),
    app("xbox_tcui", "Xbox TCUI", "Componente de interfaz de Xbox Live.", XBOX, "Microsoft.Xbox.TCUI", None),
    app("xbox_speech", "Xbox Speech to Text", "Superposición de voz a texto.", XBOX, "Microsoft.XboxSpeechToTextOverlay", None),
    app("xbox_identity", "Xbox Identity Provider", "Inicio de sesión de Xbox en juegos.", XBOX, "Microsoft.XboxIdentityProvider", Some("Algunos juegos de PC (Forza, Minecraft...) lo necesitan.")),
    app("solitaire", "Solitaire Collection", "Juegos de cartas con anuncios.", XBOX, "Microsoft.MicrosoftSolitaireCollection", None),

    app("weather", "El Tiempo", "App del tiempo (MSN).", UTIL, "Microsoft.BingWeather", None),
    app("news", "Noticias", "App de noticias (MSN).", UTIL, "Microsoft.BingNews", None),
    app("maps", "Mapas", "Mapas de Windows.", UTIL, "Microsoft.WindowsMaps", None),
    app("get_help", "Obtener ayuda", "Soporte de Microsoft.", UTIL, "Microsoft.GetHelp", None),
    app("tips", "Consejos", "App de consejos de Windows.", UTIL, "Microsoft.Getstarted", None),
    app("feedback", "Centro de opiniones", "Feedback Hub.", UTIL, "Microsoft.WindowsFeedbackHub", None),
    app("phone_link", "Vínculo móvil", "Conecta tu teléfono al PC.", UTIL, "Microsoft.YourPhone", None),
    app("clipchamp", "Clipchamp", "Editor de vídeo.", UTIL, "Clipchamp.Clipchamp", None),
    app("sticky_notes", "Sticky Notes", "Notas rápidas.", UTIL, "Microsoft.MicrosoftStickyNotes", None),
    app("sound_recorder", "Grabadora de sonido", "Grabadora de voz.", UTIL, "Microsoft.WindowsSoundRecorder", None),
    app("alarms", "Alarmas y reloj", "Alarmas, temporizador y reloj.", UTIL, "Microsoft.WindowsAlarms", None),
    app("camera", "Cámara", "App Cámara.", UTIL, "Microsoft.WindowsCamera", None),
    app("paint", "Paint", "Editor de imágenes.", UTIL, "Microsoft.Paint", None),
    app("paint3d", "Paint 3D", "Paint 3D (descontinuado).", UTIL, "Microsoft.MSPaint", None),
    app("viewer3d", "Visor 3D", "Visor de modelos 3D.", UTIL, "Microsoft.Microsoft3DViewer", None),
    app("mixed_reality", "Portal de realidad mixta", "Para visores Windows Mixed Reality.", UTIL, "Microsoft.MixedReality.Portal", None),
    app("quick_assist", "Asistencia rápida", "Control remoto de Microsoft. Muy usado en estafas de \"soporte técnico\".", UTIL, "MicrosoftCorporationII.QuickAssist", None),
    app("zune_music", "Reproductor multimedia", "Reproductor de música/vídeo de Windows.", UTIL, "Microsoft.ZuneMusic", None),
    app("zune_video", "Películas y TV", "App de películas.", UTIL, "Microsoft.ZuneVideo", None),

    app("spotify", "Spotify (preinstalado)", "Acceso directo promocional.", PROMO, "SpotifyAB.SpotifyMusic", None),
    app("disney", "Disney+", "Promocional.", PROMO, "Disney.37853FA22FAF4", None),
    app("candy", "Candy Crush", "Juegos de King preinstalados.", PROMO, "king.com.*", None),
    app("tiktok", "TikTok (preinstalado)", "Acceso promocional de la Store.", PROMO, "BytedancePte.Ltd.TikTok", None),
    app("instagram", "Instagram (preinstalado)", "Promocional.", PROMO, "Facebook.Instagram*", None),
    app("linkedin", "LinkedIn", "Promocional.", PROMO, "7EE7776C.LinkedInforWindows", None),
    app("amazon", "Amazon Prime Video", "Promocional.", PROMO, "AmazonVideo.PrimeVideo", None),
];

/// Coincidencia simple con * (equivalente a -like de PowerShell, sin distinguir mayúsculas).
fn like(name: &str, pat: &str) -> bool {
    let name = name.to_lowercase();
    let pat = pat.to_lowercase();
    let parts: Vec<&str> = pat.split('*').collect();
    if parts.len() == 1 {
        return name == pat;
    }
    let mut pos = 0usize;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            if !name.starts_with(part) {
                return false;
            }
            pos = part.len();
        } else if i == parts.len() - 1 {
            return name.len() >= pos + part.len() && name.ends_with(part);
        } else {
            match name[pos..].find(part) {
                Some(f) => pos += f + part.len(),
                None => return false,
            }
        }
    }
    true
}

#[derive(Deserialize)]
struct Installed {
    names: Vec<String>,
    onedrive: bool,
}

pub fn list() -> Result<Vec<BloatApp>, String> {
    let inst: Installed = ps::run_json(
        r#"
$names = @(Get-AppxPackage -AllUsers | Select-Object -ExpandProperty Name)
$names += @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName)
$od = (Test-Path "$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe") -or (Test-Path "$env:ProgramFiles\Microsoft OneDrive\OneDrive.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Microsoft OneDrive\OneDrive.exe")
ConvertTo-Json -InputObject @{ names = @($names | Sort-Object -Unique); onedrive = [bool]$od } -Compress
"#,
    )?;
    Ok(CATALOG
        .iter()
        .map(|a| {
            let mut a = a.clone();
            a.installed = if a.id == "onedrive" {
                inst.onedrive
            } else {
                inst.names.iter().any(|n| like(n, a.pkg))
            };
            a
        })
        .collect())
}

pub fn remove(ids: &[String]) -> Result<(), String> {
    let mut s = String::from("$errs = @()\n");
    for id in ids {
        let a = CATALOG
            .iter()
            .find(|a| a.id == id)
            .ok_or_else(|| format!("App desconocida: {id}"))?;
        if a.id == "onedrive" {
            s += r#"
try {
  Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue
  $u = Get-Reg 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\OneDriveSetup.exe' 'UninstallString'
  if ($u) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c $u" -Wait -WindowStyle Hidden
  } else {
    $setup = "$env:SystemRoot\System32\OneDriveSetup.exe"
    if (-not (Test-Path $setup)) { $setup = "$env:SystemRoot\SysWOW64\OneDriveSetup.exe" }
    if (Test-Path $setup) { Start-Process -FilePath $setup -ArgumentList '/uninstall' -Wait }
    else { & winget.exe uninstall --id Microsoft.OneDrive -e --silent --accept-source-agreements | Out-Null }
  }
} catch { $errs += "OneDrive: $($_.Exception.Message)" }
"#;
            continue;
        }
        s += &format!(
            r#"
try {{ Get-AppxPackage -AllUsers -Name {pat} | Remove-AppxPackage -AllUsers -ErrorAction Stop }} catch {{ $errs += {name} + ': ' + $_.Exception.Message }}
try {{ Get-AppxProvisionedPackage -Online | Where-Object {{ $_.DisplayName -like {pat} }} | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Out-Null }} catch {{ }}
"#,
            pat = q(a.pkg),
            name = q(a.name)
        );
    }
    s += "if ($errs.Count -gt 0) { throw ($errs -join ' | ') }\n";
    ps::run(&s).map(|_| ())
}
