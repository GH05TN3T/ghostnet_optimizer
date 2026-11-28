import { invoke } from "@tauri-apps/api/core";

export type Category = "privacidad" | "interfaz" | "sistema" | "rendimiento" | "gpu" | "seguridad";

export interface TweakInfo {
  id: string;
  name: string;
  desc: string;
  category: Category;
  recommended: boolean;
  reboot: boolean;
  explorer: boolean;
  risk: string | null;
  vendor: string | null;
  changes: string[];
}

export interface AppItem {
  id: string;
  name: string;
  desc: string;
  category: string;
  popular: number;
  color: string;
  installed: boolean;
}

export interface Game {
  name: string;
  source: string;
  exe: string;
  optimized: boolean;
}

export interface IsoInfo {
  editions: { index: number; name: string }[];
  arch: string;
  version: string;
  size: number;
  esd: boolean;
}

export interface BuildOptions {
  iso: string;
  out: string;
  index: number;
  profile: "ligero" | "gaming" | "minimo";
  bypass: boolean;
  local_account: boolean;
  deep_clean: boolean;
  esd: boolean;
}

export interface PowerStatus {
  battery: number | null;
  plugged: boolean;
  temp: number | null;
}

export interface SysInfo {
  os: string;
  version: string;
  build: string;
  host: string;
  user: string;
  cpu: string;
  cores: number;
  threads: number;
  gpus: string[];
  ram_total: number;
  ram_speed: number;
  board: string;
  drives: string[];
  is_admin: boolean;
  laptop: boolean;
}

export interface DiskInfo {
  mount: string;
  name: string;
  total: number;
  free: number;
}

export interface ProcInfo {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
}

export interface LiveStats {
  cpu: number;
  cores: number[];
  freq_mhz: number;
  ram_used: number;
  ram_total: number;
  swap_used: number;
  swap_total: number;
  gpu: number;
  disk_read: number;
  disk_write: number;
  net_down: number;
  net_up: number;
  disks: DiskInfo[];
  processes: number;
  top: ProcInfo[];
  uptime: number;
}

export interface BloatApp {
  id: string;
  name: string;
  desc: string;
  category: string;
  risk: string | null;
  installed: boolean;
}

export interface PowerPlan {
  guid: string;
  name: string;
  active: boolean;
}

export interface PlanSetting {
  id: string;
  ac: number | null;
  dc: number | null;
}

export interface JunkCategory {
  id: string;
  name: string;
  desc: string;
  default: boolean;
  size: number;
  files: number;
}

export interface StartupItem {
  id: string;
  name: string;
  command: string;
  source: string;
  enabled: boolean;
}

export const POWER = {
  balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",
  high: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
  saver: "a1841308-3541-4fab-bc81-f71556f20b4a",
  ultimate: "e9a42b02-d5df-448d-aa00-03f14749eb61",
} as const;

/** True si corremos dentro de la app de Tauri (y no en un navegador con `npm run dev`). */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) {
    return Promise.reject("Abre la app con `npm run app:dev`: en el navegador no hay acceso a Windows.");
  }
  return invoke<T>(cmd, args);
}

export interface DriverDevice {
  name: string;
  class: string;
  status: string;
  problem: number;
  instance_id: string;
}

export interface DriversStatus {
  manufacturer: string;
  model: string;
  sku: string;
  serial: string;
  bios: string;
  os: string;
  missing: DriverDevice[];
  wmic: "present" | "absent" | "unknown";
}

export const api = {
  systemInfo: () => call<SysInfo>("system_info"),
  liveStats: () => call<LiveStats>("live_stats"),
  killProcess: (name: string) => call<number>("kill_process", { name }),
  ping: () => call<{ ms: number | null; jitter: number | null }>("ping"),
  cleanRam: () => call<number>("clean_ram"),
  createRestorePoint: () => call<void>("create_restore_point"),
  openRestoreUi: () => call<void>("open_restore_ui"),
  restartExplorer: () => call<void>("restart_explorer"),

  listTweaks: () => call<TweakInfo[]>("list_tweaks"),
  checkTweaks: (ids?: string[]) => call<Record<string, boolean>>("check_tweaks", { ids: ids ?? null }),
  setTweaks: (ids: string[], enable: boolean) => call<Record<string, boolean>>("set_tweaks", { ids, enable }),

  listBloat: () => call<BloatApp[]>("list_bloat"),
  removeBloat: (ids: string[]) => call<void>("remove_bloat", { ids }),

  powerPlans: () => call<PowerPlan[]>("power_plans"),
  powerSetActive: (guid: string) => call<void>("power_set_active", { guid }),
  powerAdd: (kind: "ultimate" | "high" | "balanced" | "saver") => call<string>("power_add", { kind }),
  powerDelete: (guid: string) => call<void>("power_delete", { guid }),
  powerSettings: (guid: string) => call<PlanSetting[]>("power_settings", { guid }),
  powerSetSetting: (guid: string, id: string, ac: number, dc: number) =>
    call<void>("power_set_setting", { guid, id, ac, dc }),

  powerStatus: () => call<PowerStatus>("power_status"),
  openPowerSettings: () => call<void>("open_power_settings"),

  appsList: () => call<{ winget: boolean; apps: AppItem[] }>("apps_list"),
  appInstall: (id: string) => call<void>("app_install", { id }),
  appUninstall: (id: string) => call<void>("app_uninstall", { id }),

  gamesList: () => call<Game[]>("games_list"),
  gameOptimize: (exe: string, enable: boolean) => call<void>("game_optimize", { exe, enable }),

  builderInspect: (iso: string) => call<IsoInfo>("builder_inspect", { iso }),
  builderHash: (iso: string) => call<string>("builder_hash", { iso }),
  builderStart: (options: BuildOptions) => call<void>("builder_start", { options }),
  builderCancel: (out: string, iso: string) => call<void>("builder_cancel", { out, iso }),
  isoLanguages: () => call<{ session: string; languages: { id: string; name: string; display: string }[] }>("iso_languages"),
  isoDownload: (sku: string, session: string, dir: string) => call<void>("iso_download", { sku, session, dir }),
  isoDownloadCancel: () => call<void>("iso_download_cancel"),
  revealFile: (path: string) => call<void>("reveal_file", { path }),
  openIsoDownload: () => call<void>("open_iso_download"),

  scanJunk: () => call<JunkCategory[]>("scan_junk"),
  cleanJunk: (ids: string[]) => call<number>("clean_junk", { ids }),
  componentCleanup: () => call<string>("component_cleanup"),
  compactQuery: () => call<string>("compact_query"),
  compactSet: (enable: boolean) => call<string>("compact_set", { enable }),

  startupList: () => call<StartupItem[]>("startup_list"),
  startupSet: (id: string, enabled: boolean) => call<void>("startup_set", { id, enabled }),

  driversStatus: () => call<DriversStatus>("drivers_status"),
  driversUpdate: () => call<void>("drivers_update"),
  wmicInstall: () => call<string>("wmic_install"),
  openDeviceManager: () => call<void>("open_device_manager"),
  openUrl: (url: string) => call<void>("open_url", { url }),
  driversBackup: (dir: string) => call<string>("drivers_backup", { dir }),
};

export function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}
