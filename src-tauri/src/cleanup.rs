//! Limpieza de archivos basura: temporales, cachés, volcados, etc.

use crate::ps;
use serde::Serialize;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct JunkCategory {
    pub id: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
    /// Si viene marcada por defecto en la UI.
    pub default: bool,
    pub size: u64,
    pub files: u64,
}

struct Def {
    id: &'static str,
    name: &'static str,
    desc: &'static str,
    default: bool,
}

const DEFS: &[Def] = &[
    Def { id: "temp_user", name: "Temporales de usuario", desc: "Carpeta %TEMP%: restos de instaladores y programas.", default: true },
    Def { id: "temp_win", name: "Temporales de Windows", desc: "C:\\Windows\\Temp.", default: true },
    Def { id: "wu_cache", name: "Caché de Windows Update", desc: "Actualizaciones ya instaladas que quedaron descargadas.", default: true },
    Def { id: "delivery", name: "Caché de Optimización de distribución", desc: "Trozos de actualizaciones compartidas por P2P.", default: true },
    Def { id: "crash", name: "Volcados de memoria", desc: "Minidumps y MEMORY.DMP de pantallazos azules y cierres de apps.", default: true },
    Def { id: "wer", name: "Informes de errores", desc: "Informes de fallos guardados por Windows.", default: true },
    Def { id: "logs", name: "Registros de Windows", desc: "Logs de CBS, DISM y de instalación.", default: true },
    Def { id: "thumbs", name: "Caché de miniaturas", desc: "Se regeneran solas al abrir carpetas. Arregla miniaturas corruptas.", default: false },
    Def { id: "shaders", name: "Caché de shaders (DirectX / NVIDIA / AMD)", desc: "Los juegos la regeneran; la primera partida puede dar tirones.", default: false },
    Def { id: "browsers", name: "Caché de navegadores", desc: "Chrome, Edge, Brave, Opera GX y Firefox. No borra contraseñas ni historial.", default: false },
    Def { id: "discord", name: "Caché de Discord", desc: "Imágenes y archivos que Discord guarda en caché.", default: false },
    Def { id: "fivem", name: "Caché de FiveM", desc: "data\\cache y server-cache. Los servidores volverán a descargar sus recursos.", default: false },
    Def { id: "prefetch", name: "Prefetch", desc: "Windows lo regenera; el siguiente arranque puede ir un poco más lento.", default: false },
    Def { id: "recycle", name: "Papelera de reciclaje", desc: "Vacía la papelera de todas las unidades.", default: true },
];

fn env(k: &str) -> PathBuf {
    PathBuf::from(std::env::var_os(k).unwrap_or_default())
}

/// Subcarpetas de perfil de un navegador Chromium (Default, Profile 1...) con sus cachés.
fn chromium(base: PathBuf) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&base) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                for sub in ["Cache", "Code Cache", "GPUCache", "Service Worker\\CacheStorage"] {
                    let c = p.join(sub);
                    if c.exists() {
                        v.push(c);
                    }
                }
            }
        }
    }
    v
}

/// Rutas de una categoría, descartando cualquier ruta relativa o demasiado corta
/// (por ejemplo si falta una variable de entorno), para no borrar nunca algo inesperado.
fn paths(id: &str) -> Vec<PathBuf> {
    raw_paths(id)
        .into_iter()
        .filter(|p| p.is_absolute() && p.components().count() >= 3)
        .collect()
}

/// Rutas (carpetas o archivos) de cada categoría.
fn raw_paths(id: &str) -> Vec<PathBuf> {
    let win = env("SystemRoot");
    let local = env("LOCALAPPDATA");
    let roaming = env("APPDATA");
    let pdata = env("ProgramData");
    match id {
        "temp_user" => vec![std::env::temp_dir()],
        "temp_win" => vec![win.join("Temp")],
        "wu_cache" => vec![win.join("SoftwareDistribution\\Download")],
        "delivery" => vec![win.join("ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache")],
        "crash" => vec![local.join("CrashDumps"), win.join("Minidump"), win.join("MEMORY.DMP"), win.join("LiveKernelReports")],
        "wer" => vec![
            pdata.join("Microsoft\\Windows\\WER\\ReportArchive"),
            pdata.join("Microsoft\\Windows\\WER\\ReportQueue"),
            local.join("Microsoft\\Windows\\WER"),
        ],
        "logs" => vec![win.join("Logs\\CBS"), win.join("Logs\\DISM"), win.join("Panther"), win.join("inf\\setupapi.dev.log")],
        "thumbs" => {
            let dir = local.join("Microsoft\\Windows\\Explorer");
            let mut v = Vec::new();
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    if (n.starts_with("thumbcache_") || n.starts_with("iconcache_")) && n.ends_with(".db") {
                        v.push(e.path());
                    }
                }
            }
            v
        }
        "shaders" => vec![
            local.join("D3DSCache"),
            local.join("NVIDIA\\DXCache"),
            local.join("NVIDIA\\GLCache"),
            local.join("NVIDIA Corporation\\NV_Cache"),
            local.join("AMD\\DxCache"),
            local.join("AMD\\DxcCache"),
            local.join("AMD\\GLCache"),
            local.join("AMD\\VkCache"),
        ],
        "browsers" => {
            let mut v = Vec::new();
            v.extend(chromium(local.join("Google\\Chrome\\User Data")));
            v.extend(chromium(local.join("Microsoft\\Edge\\User Data")));
            v.extend(chromium(local.join("BraveSoftware\\Brave-Browser\\User Data")));
            v.extend(chromium(local.join("Vivaldi\\User Data")));
            for opera in ["Opera Software\\Opera GX Stable", "Opera Software\\Opera Stable"] {
                for sub in ["Cache", "Code Cache", "GPUCache"] {
                    v.push(local.join(opera).join(sub));
                    v.push(roaming.join(opera).join(sub));
                }
            }
            if let Ok(rd) = std::fs::read_dir(local.join("Mozilla\\Firefox\\Profiles")) {
                for e in rd.flatten() {
                    v.push(e.path().join("cache2"));
                }
            }
            v
        }
        "discord" => {
            let mut v = Vec::new();
            for app in ["discord", "discordptb", "discordcanary"] {
                for sub in ["Cache", "Code Cache", "GPUCache"] {
                    v.push(roaming.join(app).join(sub));
                }
            }
            v
        }
        "fivem" => {
            let d = local.join("FiveM\\FiveM.app\\data");
            vec![d.join("cache"), d.join("server-cache"), d.join("server-cache-priv"), d.join("nui-storage\\Default\\Cache")]
        }
        "prefetch" => vec![win.join("Prefetch")],
        "recycle" => recycle_bins(),
        _ => vec![],
    }
}

fn recycle_bins() -> Vec<PathBuf> {
    let mut v = Vec::new();
    for letter in b'C'..=b'Z' {
        let p = PathBuf::from(format!("{}:\\$Recycle.Bin", letter as char));
        if p.exists() {
            v.push(p);
        }
    }
    v
}

fn measure(p: &Path) -> (u64, u64) {
    let mut size = 0;
    let mut files = 0;
    if p.is_file() {
        if let Ok(m) = p.metadata() {
            return (m.len(), 1);
        }
        return (0, 0);
    }
    for e in WalkDir::new(p).follow_links(false).into_iter().flatten() {
        if e.file_type().is_file() {
            if let Ok(m) = e.metadata() {
                size += m.len();
                files += 1;
            }
        }
    }
    (size, files)
}

pub fn scan() -> Vec<JunkCategory> {
    DEFS.iter()
        .map(|d| {
            let (mut size, mut files) = (0, 0);
            for p in paths(d.id) {
                let (s, f) = measure(&p);
                size += s;
                files += f;
            }
            JunkCategory { id: d.id, name: d.name, desc: d.desc, default: d.default, size, files }
        })
        .collect()
}

/// Borra el contenido de una ruta (no la carpeta raíz). Devuelve bytes liberados.
/// Los archivos en uso se saltan sin error.
fn wipe(p: &Path) -> u64 {
    let mut freed = 0;
    if p.is_file() {
        let len = p.metadata().map(|m| m.len()).unwrap_or(0);
        if std::fs::remove_file(p).is_ok() {
            freed += len;
        }
        return freed;
    }
    if !p.is_dir() {
        return 0;
    }
    for e in WalkDir::new(p).follow_links(false).contents_first(true).min_depth(1).into_iter().flatten() {
        let path = e.path();
        if e.file_type().is_dir() {
            let _ = std::fs::remove_dir(path);
        } else {
            let len = e.metadata().map(|m| m.len()).unwrap_or(0);
            if std::fs::remove_file(path).is_ok() {
                freed += len;
            } else {
                // Algunos archivos de solo lectura: quitar el atributo y reintentar.
                if let Ok(m) = std::fs::metadata(path) {
                    let mut perm = m.permissions();
                    #[allow(clippy::permissions_set_readonly_false)]
                    perm.set_readonly(false);
                    let _ = std::fs::set_permissions(path, perm);
                    if std::fs::remove_file(path).is_ok() {
                        freed += len;
                    }
                }
            }
        }
    }
    freed
}

pub fn clean(ids: &[String]) -> Result<u64, String> {
    let mut freed = 0u64;
    for id in ids {
        if !DEFS.iter().any(|d| d.id == id) {
            return Err(format!("Categoría desconocida: {id}"));
        }
        match id.as_str() {
            "recycle" => {
                let before: u64 = recycle_bins().iter().map(|p| measure(p).0).sum();
                let _ = ps::run("Clear-RecycleBin -Force -ErrorAction SilentlyContinue");
                let after: u64 = recycle_bins().iter().map(|p| measure(p).0).sum();
                freed += before.saturating_sub(after);
            }
            "wu_cache" => {
                // Hay que parar Windows Update para poder borrar su caché.
                let _ = ps::run("Stop-Service -Name wuauserv, bits -Force -ErrorAction SilentlyContinue");
                for p in paths(id) {
                    freed += wipe(&p);
                }
                let _ = ps::run("Start-Service -Name wuauserv, bits -ErrorAction SilentlyContinue");
            }
            "delivery" => {
                let before: u64 = paths(id).iter().map(|p| measure(p).0).sum();
                let _ = ps::run("Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue");
                for p in paths(id) {
                    wipe(&p);
                }
                let after: u64 = paths(id).iter().map(|p| measure(p).0).sum();
                freed += before.saturating_sub(after);
            }
            _ => {
                for p in paths(id) {
                    freed += wipe(&p);
                }
            }
        }
    }
    Ok(freed)
}

/// Limpieza del almacén de componentes (WinSxS) con DISM. Tarda varios minutos.
pub fn component_cleanup() -> Result<String, String> {
    ps::run("Invoke-Oem { Dism.exe /Online /Cleanup-Image /StartComponentCleanup /NoRestart }")
}

pub fn compact_query() -> Result<String, String> {
    ps::run("Invoke-Oem { compact.exe /compactos:query }")
}

pub fn compact_set(enable: bool) -> Result<String, String> {
    let mode = if enable { "always" } else { "never" };
    ps::run(&format!("Invoke-Oem {{ compact.exe /compactos:{mode} }}"))
}
