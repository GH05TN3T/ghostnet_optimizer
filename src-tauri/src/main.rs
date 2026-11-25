// Sin ventana de consola en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod apps;
mod bloat;
mod builder;
mod cleanup;
mod games;
mod power;
mod ps;
mod startup;
mod system;
mod tweaks;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

type R<T> = Result<T, String>;

/// Ejecuta trabajo bloqueante (PowerShell, disco) fuera del hilo de la UI.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> R<T> + Send + 'static) -> R<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// ---------- Sistema ----------

#[tauri::command]
async fn system_info() -> R<system::SysInfo> {
    blocking(system::info).await
}

#[tauri::command(async)]
fn live_stats(mon: State<'_, Mutex<system::Monitor>>) -> R<system::LiveStats> {
    Ok(mon.lock().map_err(|e| e.to_string())?.sample())
}

#[tauri::command(async)]
fn kill_process(name: String, mon: State<'_, Mutex<system::Monitor>>) -> R<usize> {
    mon.lock().map_err(|e| e.to_string())?.kill_name(&name)
}

#[tauri::command]
async fn ping() -> R<system::Ping> {
    blocking(|| Ok(system::ping())).await
}

#[tauri::command]
async fn clean_ram() -> R<i64> {
    blocking(system::clean_ram).await
}

#[tauri::command]
async fn create_restore_point() -> R<()> {
    blocking(|| system::create_restore_point("GhostNet Optimizer")).await
}

#[tauri::command]
fn open_restore_ui() -> R<()> {
    system::open_restore_ui()
}

#[tauri::command]
async fn restart_explorer() -> R<()> {
    blocking(system::restart_explorer).await
}

// ---------- Tweaks ----------

#[tauri::command]
fn list_tweaks() -> Vec<tweaks::TweakInfo> {
    tweaks::list()
}

#[tauri::command]
async fn check_tweaks(ids: Option<Vec<String>>) -> R<HashMap<String, bool>> {
    blocking(move || tweaks::check(ids)).await
}

/// Aplica o revierte y devuelve el estado real después del cambio.
#[tauri::command]
async fn set_tweaks(ids: Vec<String>, enable: bool) -> R<HashMap<String, bool>> {
    blocking(move || {
        let res = tweaks::set_many(&ids, enable);
        let state = tweaks::check(Some(ids))?;
        res.map(|_| state)
    })
    .await
}

// ---------- Debloat ----------

#[tauri::command]
async fn list_bloat() -> R<Vec<bloat::BloatApp>> {
    blocking(bloat::list).await
}

#[tauri::command]
async fn remove_bloat(ids: Vec<String>) -> R<()> {
    blocking(move || bloat::remove(&ids)).await
}

// ---------- Energía ----------

#[tauri::command]
async fn power_plans() -> R<Vec<power::PowerPlan>> {
    blocking(power::list).await
}

#[tauri::command]
async fn power_set_active(guid: String) -> R<()> {
    blocking(move || power::set_active(&guid)).await
}

#[tauri::command]
async fn power_add(kind: String) -> R<String> {
    let base = match kind.as_str() {
        "ultimate" => power::ULTIMATE,
        "high" => power::HIGH,
        "balanced" => power::BALANCED,
        "saver" => power::SAVER,
        _ => return Err("Tipo de plan desconocido".into()),
    };
    blocking(move || power::add_builtin(base)).await
}

#[tauri::command]
async fn power_delete(guid: String) -> R<()> {
    blocking(move || power::delete(&guid)).await
}

#[tauri::command]
async fn power_settings(guid: String) -> R<Vec<power::PlanSetting>> {
    blocking(move || power::settings(&guid)).await
}

#[tauri::command]
async fn power_set_setting(guid: String, id: String, ac: u32, dc: u32) -> R<()> {
    blocking(move || power::set_setting(&guid, &id, ac, dc)).await
}

#[tauri::command]
async fn power_status() -> R<power::PowerStatus> {
    blocking(power::status).await
}

#[tauri::command]
fn open_power_settings() -> R<()> {
    power::open_settings()
}

// ---------- Apps (winget) ----------

#[tauri::command]
async fn apps_list() -> R<apps::AppList> {
    blocking(apps::list).await
}

#[tauri::command]
async fn app_install(id: String) -> R<()> {
    blocking(move || apps::install(&id)).await
}

#[tauri::command]
async fn app_uninstall(id: String) -> R<()> {
    blocking(move || apps::uninstall(&id)).await
}

// ---------- Juegos ----------

#[tauri::command]
async fn games_list() -> R<Vec<games::Game>> {
    blocking(games::list).await
}

#[tauri::command]
async fn game_optimize(exe: String, enable: bool) -> R<()> {
    blocking(move || games::optimize(&exe, enable)).await
}

// ---------- Builder de Windows ----------

#[tauri::command]
async fn builder_inspect(iso: String) -> R<builder::IsoInfo> {
    blocking(move || builder::inspect(&iso)).await
}

#[tauri::command]
async fn builder_hash(iso: String) -> R<String> {
    blocking(move || builder::hash(&iso)).await
}

#[tauri::command]
fn builder_start(app: tauri::AppHandle, options: builder::BuildOptions) -> R<()> {
    builder::start(app, options)
}

#[tauri::command]
async fn builder_cancel(out: String, iso: String) -> R<()> {
    blocking(move || builder::cancel(&out, &iso)).await
}

#[tauri::command]
fn builder_running() -> bool {
    builder::running()
}

#[tauri::command]
fn reveal_file(path: String) -> R<()> {
    builder::reveal(&path)
}

#[tauri::command]
fn open_iso_download() -> R<()> {
    builder::open_iso_download()
}

// ---------- Limpieza ----------

#[tauri::command]
async fn scan_junk() -> R<Vec<cleanup::JunkCategory>> {
    blocking(|| Ok(cleanup::scan())).await
}

#[tauri::command]
async fn clean_junk(ids: Vec<String>) -> R<u64> {
    blocking(move || cleanup::clean(&ids)).await
}

#[tauri::command]
async fn component_cleanup() -> R<String> {
    blocking(cleanup::component_cleanup).await
}

#[tauri::command]
async fn compact_query() -> R<String> {
    blocking(cleanup::compact_query).await
}

#[tauri::command]
async fn compact_set(enable: bool) -> R<String> {
    blocking(move || cleanup::compact_set(enable)).await
}

// ---------- Inicio ----------

#[tauri::command]
async fn startup_list() -> R<Vec<startup::StartupItem>> {
    blocking(startup::list).await
}

#[tauri::command]
async fn startup_set(id: String, enabled: bool) -> R<()> {
    blocking(move || startup::set(&id, enabled)).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(system::Monitor::new()))
        .invoke_handler(tauri::generate_handler![
            system_info,
            live_stats,
            kill_process,
            ping,
            clean_ram,
            create_restore_point,
            open_restore_ui,
            restart_explorer,
            list_tweaks,
            check_tweaks,
            set_tweaks,
            list_bloat,
            remove_bloat,
            power_plans,
            power_set_active,
            power_add,
            power_delete,
            power_settings,
            power_set_setting,
            power_status,
            open_power_settings,
            apps_list,
            app_install,
            app_uninstall,
            games_list,
            game_optimize,
            builder_inspect,
            builder_hash,
            builder_start,
            builder_cancel,
            builder_running,
            reveal_file,
            open_iso_download,
            scan_junk,
            clean_junk,
            component_cleanup,
            compact_query,
            compact_set,
            startup_list,
            startup_set,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
