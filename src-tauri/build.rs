fn main() {
    // En release la app pide permisos de administrador al abrirse (los tweaks tocan HKLM,
    // servicios y paquetes del sistema). En `tauri dev` no, porque cargo no puede lanzar
    // un .exe que exige elevación desde una terminal normal (error 740).
    let release = std::env::var("PROFILE").map(|p| p == "release").unwrap_or(false);
    let manifest = if release {
        include_str!("app.manifest")
    } else {
        include_str!("app.dev.manifest")
    };
    let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("error en tauri-build");
}
