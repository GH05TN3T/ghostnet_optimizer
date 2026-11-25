//! Instalador de apps con winget (el gestor de paquetes oficial de Windows).

use crate::ps::{self, q};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub struct App {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    pub category: &'static str,
    /// Orden en "Populares" (0 = no aparece).
    pub popular: u8,
    pub color: &'static str,
    pub installed: bool,
}

const fn a(
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    category: &'static str,
    popular: u8,
    color: &'static str,
) -> App {
    App { id, name, desc, category, popular, color, installed: false }
}

const NAV: &str = "Navegadores";
const COM: &str = "Comunicación";
const MED: &str = "Multimedia";
const DEV: &str = "Desarrollo";
const UTI: &str = "Utilidades";
const RUN: &str = "Runtimes";
const PRO: &str = "Productividad";
const SEG: &str = "Seguridad";
const JUE: &str = "Juegos";

/// `id` es el identificador exacto de winget.
pub const CATALOG: &[App] = &[
    a("Google.Chrome", "Google Chrome", "Navegador web de Google", NAV, 1, "#4285f4"),
    a("Mozilla.Firefox", "Mozilla Firefox", "Navegador libre de Mozilla", NAV, 4, "#ff7139"),
    a("Brave.Brave", "Brave", "Navegador con bloqueador de anuncios", NAV, 0, "#fb542b"),
    a("Opera.OperaGX", "Opera GX", "Navegador para gamers con limitador de RAM/CPU", NAV, 0, "#fa1e4e"),
    a("Vivaldi.Vivaldi", "Vivaldi", "Navegador muy personalizable", NAV, 0, "#ef3939"),

    a("Discord.Discord", "Discord", "Voz y chat para comunidades", COM, 2, "#5865f2"),
    a("Telegram.TelegramDesktop", "Telegram", "Mensajería rápida y segura", COM, 0, "#29a9eb"),
    a("Zoom.Zoom", "Zoom", "Videollamadas y reuniones", COM, 0, "#2d8cff"),
    a("Microsoft.Teams", "Microsoft Teams", "Chat y reuniones de Microsoft", COM, 0, "#5b5fc7"),
    a("SlackTechnologies.Slack", "Slack", "Mensajería para equipos", COM, 0, "#e01e5a"),

    a("OBSProject.OBSStudio", "OBS Studio", "Grabación y streaming (TikTok, Twitch, YouTube)", MED, 3, "#6b6b6b"),
    a("Spotify.Spotify", "Spotify", "Música y podcasts", MED, 6, "#1db954"),
    a("VideoLAN.VLC", "VLC", "Reproduce cualquier vídeo o audio", MED, 7, "#ff8800"),
    a("Audacity.Audacity", "Audacity", "Editor de audio", MED, 0, "#0000cc"),
    a("HandBrake.HandBrake", "HandBrake", "Convierte y comprime vídeos", MED, 0, "#c0392b"),
    a("GIMP.GIMP.3", "GIMP", "Editor de imágenes libre", MED, 0, "#7f6b59"),
    a("KDE.Krita", "Krita", "Pintura digital", MED, 0, "#3babff"),
    a("BlenderFoundation.Blender", "Blender", "Modelado y animación 3D", MED, 0, "#ea7600"),
    a("ShareX.ShareX", "ShareX", "Capturas y grabaciones de pantalla", MED, 0, "#2b9fe0"),
    a("CodecGuide.K-LiteCodecPack.Standard", "K-Lite Codec Pack", "Códecs de audio y vídeo", MED, 0, "#4a7ab8"),

    a("Microsoft.VisualStudioCode", "Visual Studio Code", "Editor de código", DEV, 5, "#0078d4"),
    a("Git.Git", "Git", "Control de versiones", DEV, 0, "#f05032"),
    a("GitHub.GitHubDesktop", "GitHub Desktop", "Git con interfaz gráfica", DEV, 0, "#8250df"),
    a("OpenJS.NodeJS.LTS", "Node.js LTS", "JavaScript fuera del navegador", DEV, 0, "#5fa04e"),
    a("Python.Python.3.13", "Python 3.13", "Lenguaje de programación", DEV, 0, "#3776ab"),
    a("Rustlang.Rustup", "Rustup", "Instalador de Rust", DEV, 0, "#ce422b"),
    a("Notepad++.Notepad++", "Notepad++", "Editor de texto ligero", DEV, 0, "#90e59a"),
    a("Microsoft.WindowsTerminal", "Windows Terminal", "Terminal moderna con pestañas", DEV, 0, "#4d4d4d"),
    a("Microsoft.PowerShell", "PowerShell 7", "La versión nueva de PowerShell", DEV, 0, "#2671be"),
    a("HeidiSQL.HeidiSQL", "HeidiSQL", "Cliente MySQL/MariaDB (ideal para servidores FiveM)", DEV, 0, "#7aa6d4"),
    a("Docker.DockerDesktop", "Docker Desktop", "Contenedores", DEV, 0, "#2496ed"),
    a("Postman.Postman", "Postman", "Prueba APIs", DEV, 0, "#ff6c37"),
    a("WinSCP.WinSCP", "WinSCP", "Cliente SFTP/FTP", DEV, 0, "#1d6fb8"),
    a("PuTTY.PuTTY", "PuTTY", "Cliente SSH", DEV, 0, "#3d3d3d"),

    a("7zip.7zip", "7-Zip", "Comprime y descomprime archivos", UTI, 8, "#1a1a1a"),
    a("RARLab.WinRAR", "WinRAR", "Compresor de archivos", UTI, 0, "#7a3fa0"),
    a("voidtools.Everything", "Everything", "Busca archivos al instante", UTI, 0, "#ff8c1a"),
    a("Microsoft.PowerToys", "PowerToys", "Utilidades avanzadas de Microsoft", UTI, 0, "#1e88e5"),
    a("Guru3D.Afterburner", "MSI Afterburner", "Overclock y monitor de FPS", UTI, 9, "#d81f26"),
    a("REALiX.HWiNFO", "HWiNFO", "Sensores y temperaturas del PC", UTI, 0, "#2e7d32"),
    a("CPUID.CPU-Z", "CPU-Z", "Información del procesador y la RAM", UTI, 0, "#6a5acd"),
    a("TechPowerUp.GPU-Z", "GPU-Z", "Información de la tarjeta gráfica", UTI, 0, "#3a7d3a"),
    a("CrystalDewWorld.CrystalDiskInfo", "CrystalDiskInfo", "Salud de tus discos", UTI, 0, "#4fa3e0"),
    a("CrystalDewWorld.CrystalDiskMark", "CrystalDiskMark", "Velocidad de tus discos", UTI, 0, "#3b8fd1"),
    a("AnyDesk.AnyDesk", "AnyDesk", "Escritorio remoto", UTI, 0, "#ef443b"),
    a("TeamViewer.TeamViewer", "TeamViewer", "Control remoto", UTI, 0, "#0e8ee9"),
    a("qBittorrent.qBittorrent", "qBittorrent", "Cliente BitTorrent sin anuncios", UTI, 0, "#2f67ba"),
    a("Rufus.Rufus", "Rufus", "Crea USB de arranque", UTI, 0, "#6b8e23"),
    a("WinDirStat.WinDirStat", "WinDirStat", "Qué ocupa tu disco", UTI, 0, "#d4a017"),
    a("Klocman.BulkCrapUninstaller", "Bulk Crap Uninstaller", "Desinstala muchos programas a la vez", UTI, 0, "#8b5a2b"),
    a("LocalSend.LocalSend", "LocalSend", "Pasa archivos entre PC y móvil por WiFi", UTI, 0, "#008080"),

    a("Microsoft.VCRedist.2015+.x64", "Visual C++ 2015-2022 (x64)", "Necesario para muchos juegos y programas", RUN, 10, "#68217a"),
    a("Microsoft.VCRedist.2015+.x86", "Visual C++ 2015-2022 (x86)", "Versión de 32 bits", RUN, 0, "#68217a"),
    a("Microsoft.DirectX", "DirectX (End-User Runtime)", "Componentes de DirectX 9 para juegos antiguos", RUN, 0, "#107c10"),
    a("Microsoft.XNARedist", "XNA Framework", "Runtime de juegos XNA", RUN, 0, "#107c10"),
    a("Microsoft.DotNet.DesktopRuntime.8", ".NET Desktop Runtime 8", "Runtime de .NET", RUN, 0, "#512bd4"),
    a("Microsoft.EdgeWebView2Runtime", "WebView2 Runtime", "Motor web que usan muchas apps", RUN, 0, "#0078d7"),
    a("Oracle.JavaRuntimeEnvironment", "Java (JRE)", "Para Minecraft Java y otras apps", RUN, 0, "#e76f00"),
    a("EclipseAdoptium.Temurin.21.JRE", "Temurin 21 JRE", "Java libre y actualizado", RUN, 0, "#ff1464"),

    a("Notion.Notion", "Notion", "Notas, wikis y tareas", PRO, 0, "#2f2f2f"),
    a("Obsidian.Obsidian", "Obsidian", "Notas en Markdown", PRO, 0, "#7c3aed"),
    a("TheDocumentFoundation.LibreOffice", "LibreOffice", "Suite ofimática gratis", PRO, 0, "#18a303"),
    a("Adobe.Acrobat.Reader.64-bit", "Acrobat Reader", "Lector de PDF de Adobe", PRO, 0, "#ec1c24"),
    a("SumatraPDF.SumatraPDF", "SumatraPDF", "Lector de PDF ligero", PRO, 0, "#f2c811"),
    a("Google.GoogleDrive", "Google Drive", "Sincroniza tu Drive", PRO, 0, "#1fa463"),

    a("Malwarebytes.Malwarebytes", "Malwarebytes", "Escáner antimalware", SEG, 0, "#0d3ecc"),
    a("Bitwarden.Bitwarden", "Bitwarden", "Gestor de contraseñas", SEG, 0, "#175ddc"),
    a("KeePassXCTeam.KeePassXC", "KeePassXC", "Gestor de contraseñas local", SEG, 0, "#6cac4d"),
    a("Proton.ProtonVPN", "Proton VPN", "VPN gratuita y sin registros", SEG, 0, "#6d4aff"),
    a("Cloudflare.Warp", "Cloudflare WARP", "DNS 1.1.1.1 y túnel seguro", SEG, 0, "#f38020"),

    a("Valve.Steam", "Steam", "Tienda y biblioteca de juegos", JUE, 0, "#1b2838"),
    a("EpicGames.EpicGamesLauncher", "Epic Games", "Tienda de Epic", JUE, 0, "#313131"),
    a("ElectronicArts.EADesktop", "EA app", "Juegos de EA", JUE, 0, "#ff4747"),
    a("Ubisoft.Connect", "Ubisoft Connect", "Juegos de Ubisoft", JUE, 0, "#0070ff"),
    a("GOG.Galaxy", "GOG Galaxy", "Juegos sin DRM", JUE, 0, "#86328a"),
    a("Blizzard.BattleNet", "Battle.net", "Juegos de Blizzard", JUE, 0, "#148eff"),
    a("Parsec.Parsec", "Parsec", "Juega en remoto con baja latencia", JUE, 0, "#2b2b2b"),
    a("Playnite.Playnite", "Playnite", "Todas tus bibliotecas en una", JUE, 0, "#3d6fb6"),
];

fn find(id: &str) -> Result<&'static App, String> {
    CATALOG.iter().find(|a| a.id == id).ok_or_else(|| format!("App desconocida: {id}"))
}

#[derive(Deserialize)]
struct Installed {
    winget: bool,
    ids: Vec<String>,
}

#[derive(Serialize)]
pub struct AppList {
    pub winget: bool,
    pub apps: Vec<App>,
}

pub fn list() -> Result<AppList, String> {
    // `winget export` da los IDs instalados en JSON (no depende del idioma de Windows).
    let inst: Installed = ps::run_json(
        r#"
$wg = Get-Command winget.exe -ErrorAction SilentlyContinue
if (-not $wg) { ConvertTo-Json -InputObject @{ winget = $false; ids = @() } -Compress; return }
$tmp = Join-Path $env:TEMP ("ghostnet_winget_" + [guid]::NewGuid().ToString() + ".json")
$ErrorActionPreference = 'Continue'
& winget.exe export -o $tmp --accept-source-agreements --disable-interactivity 2>&1 | Out-Null
$ids = @()
if (Test-Path $tmp) {
  $j = Get-Content -Raw -LiteralPath $tmp | ConvertFrom-Json
  foreach ($s in $j.Sources) { foreach ($p in $s.Packages) { $ids += [string]$p.PackageIdentifier } }
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
ConvertTo-Json -InputObject @{ winget = $true; ids = @($ids) } -Compress
"#,
    )?;
    let lower: Vec<String> = inst.ids.iter().map(|s| s.to_lowercase()).collect();
    Ok(AppList {
        winget: inst.winget,
        apps: CATALOG
            .iter()
            .map(|a| {
                let mut a = a.clone();
                a.installed = lower.contains(&a.id.to_lowercase());
                a
            })
            .collect(),
    })
}

fn winget(action: &str, id: &str) -> Result<(), String> {
    let app = find(id)?;
    let extra = if action == "install" {
        "--accept-package-agreements --accept-source-agreements"
    } else {
        "--accept-source-agreements"
    };
    ps::run(&format!(
        r#"$ErrorActionPreference = 'Continue'
$out = Invoke-Oem {{ winget.exe {action} --id {id} -e --silent --disable-interactivity {extra} }}
$code = $LASTEXITCODE
# 0 = bien; -1978335189 / -1978335135 = ya instalado / sin actualizaciones.
if ($code -ne 0 -and $code -ne -1978335189 -and $code -ne -1978335135) {{
  $last = ($out -split "`r?`n" | Where-Object {{ $_.Trim() -and $_ -notmatch '^[\s\-\\/|█▒]+$' }} | Select-Object -Last 3) -join ' '
  throw "winget falló ($code): $last"
}}"#,
        id = q(app.id)
    ))
    .map(|_| ())
}

pub fn install(id: &str) -> Result<(), String> {
    winget("install", id)
}

pub fn uninstall(id: &str) -> Result<(), String> {
    winget("uninstall", id)
}
