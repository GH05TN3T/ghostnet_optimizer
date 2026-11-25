/**
 * Iconos originales de las apps del catálogo.
 * - dash: nombre en la colección pública dashboard-icons (PNG a buena resolución, vía jsDelivr).
 * - site: dominio oficial; se usa su icono web como respaldo.
 * Si ninguno carga (sin Internet), se muestran las iniciales.
 */
export const APP_ICONS: Record<string, { dash?: string; site?: string }> = {
  "Google.Chrome": { dash: "google-chrome" },
  "Mozilla.Firefox": { dash: "firefox" },
  "Brave.Brave": { dash: "brave" },
  "Opera.OperaGX": { site: "operagx.gg", dash: "opera" },
  "Vivaldi.Vivaldi": { dash: "vivaldi" },
  "Discord.Discord": { dash: "discord" },
  "Telegram.TelegramDesktop": { dash: "telegram" },
  "Zoom.Zoom": { dash: "zoom" },
  "Microsoft.Teams": { dash: "microsoft-teams" },
  "SlackTechnologies.Slack": { dash: "slack" },
  "OBSProject.OBSStudio": { site: "obsproject.com" },
  "Spotify.Spotify": { dash: "spotify" },
  "VideoLAN.VLC": { site: "videolan.org" },
  "Audacity.Audacity": { dash: "audacity" },
  "HandBrake.HandBrake": { dash: "handbrake" },
  "GIMP.GIMP.3": { dash: "gimp" },
  "KDE.Krita": { site: "krita.org" },
  "BlenderFoundation.Blender": { dash: "blender" },
  "ShareX.ShareX": { site: "getsharex.com" },
  "CodecGuide.K-LiteCodecPack.Standard": { site: "codecguide.com" },
  "Microsoft.VisualStudioCode": { dash: "visual-studio-code" },
  "Git.Git": { dash: "git" },
  "GitHub.GitHubDesktop": { dash: "github-light" },
  "OpenJS.NodeJS.LTS": { dash: "nodejs" },
  "Python.Python.3.13": { dash: "python" },
  "Rustlang.Rustup": { dash: "rust" },
  "Notepad++.Notepad++": { site: "notepad-plus-plus.org" },
  "Microsoft.WindowsTerminal": { dash: "terminal" },
  "Microsoft.PowerShell": { dash: "powershell" },
  "HeidiSQL.HeidiSQL": { site: "heidisql.com" },
  "Docker.DockerDesktop": { dash: "docker-light" },
  "Postman.Postman": { dash: "postman" },
  "WinSCP.WinSCP": { site: "winscp.net" },
  "PuTTY.PuTTY": { dash: "putty" },
  "7zip.7zip": { dash: "7zip" },
  "RARLab.WinRAR": { site: "win-rar.com" },
  "voidtools.Everything": { site: "voidtools.com" },
  "Microsoft.PowerToys": { site: "learn.microsoft.com" },
  "Guru3D.Afterburner": { dash: "msi" },
  "REALiX.HWiNFO": { site: "hwinfo.com" },
  "CPUID.CPU-Z": { site: "cpuid.com" },
  "TechPowerUp.GPU-Z": { site: "techpowerup.com" },
  "CrystalDewWorld.CrystalDiskInfo": { site: "crystalmark.info" },
  "CrystalDewWorld.CrystalDiskMark": { site: "crystalmark.info" },
  "AnyDesk.AnyDesk": { dash: "anydesk" },
  "TeamViewer.TeamViewer": { dash: "team-viewer" },
  "qBittorrent.qBittorrent": { dash: "qbittorrent" },
  "Rufus.Rufus": { site: "rufus.ie" },
  "WinDirStat.WinDirStat": { dash: "windirstat" },
  "Klocman.BulkCrapUninstaller": { site: "bcuninstaller.com" },
  "LocalSend.LocalSend": { site: "localsend.org" },
  "Microsoft.VCRedist.2015+.x64": { dash: "visual-studio-2022" },
  "Microsoft.VCRedist.2015+.x86": { dash: "visual-studio-2022" },
  "Microsoft.DirectX": { dash: "microsoft-windows" },
  "Microsoft.XNARedist": { dash: "xbox" },
  "Microsoft.DotNet.DesktopRuntime.8": { dash: "dotnet" },
  "Microsoft.EdgeWebView2Runtime": { dash: "microsoft-edge" },
  "Oracle.JavaRuntimeEnvironment": { dash: "java" },
  "EclipseAdoptium.Temurin.21.JRE": { dash: "java" },
  "Notion.Notion": { dash: "notion-light" },
  "Obsidian.Obsidian": { dash: "obsidian" },
  "TheDocumentFoundation.LibreOffice": { dash: "libreoffice-light" },
  "Adobe.Acrobat.Reader.64-bit": { dash: "adobe" },
  "SumatraPDF.SumatraPDF": { site: "sumatrapdfreader.org" },
  "Google.GoogleDrive": { dash: "google-drive" },
  "Malwarebytes.Malwarebytes": { site: "malwarebytes.com" },
  "Bitwarden.Bitwarden": { dash: "bitwarden" },
  "KeePassXCTeam.KeePassXC": { dash: "keepassxc" },
  "Proton.ProtonVPN": { dash: "proton-vpn" },
  "Cloudflare.Warp": { dash: "cloudflare" },
  "Valve.Steam": { dash: "steam" },
  "EpicGames.EpicGamesLauncher": { dash: "epic-games-light" },
  "ElectronicArts.EADesktop": { dash: "electronic-arts" },
  "Ubisoft.Connect": { site: "ubisoft.com" },
  "GOG.Galaxy": { site: "gog.com" },
  "Blizzard.BattleNet": { site: "battle.net" },
  "Parsec.Parsec": { site: "parsec.app" },
  "Playnite.Playnite": { site: "playnite.link" },
};

export function iconUrls(id: string): string[] {
  const i = APP_ICONS[id];
  if (!i) return [];
  const urls: string[] = [];
  const dash = i.dash ? `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${i.dash}.png` : null;
  const site = i.site ? `https://www.google.com/s2/favicons?domain=${i.site}&sz=128` : null;
  // Opera GX tiene icono propio en su web; para el resto la colección tiene mejor resolución.
  const order = id === "Opera.OperaGX" ? [site, dash] : [dash, site];
  for (const u of order) if (u) urls.push(u);
  return urls;
}
