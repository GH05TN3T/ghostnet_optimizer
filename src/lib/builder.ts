import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { inTauri } from "./api";

export const BUILD_STEPS = [
  "Preparando la carpeta de trabajo",
  "Copiando el contenido de la ISO",
  "Extrayendo la edición elegida",
  "Montando la imagen",
  "Quitando apps preinstaladas",
  "Quitando Edge y OneDrive",
  "Aplicando ajustes al registro de la imagen",
  "Limpiando componentes de la imagen",
  "Guardando la imagen",
  "Preparando el instalador (boot.wim)",
  "Creando la ISO",
  "Limpiando archivos temporales",
];

export interface BuildState {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  step: number;
  stepStarted: number;
  started: number;
  log: string[];
  error?: string;
  result?: { path: string; size: number };
  iso?: string;
  out?: string;
}

type BuilderEvent =
  | { kind: "step"; n: number; text: string }
  | { kind: "log"; text: string }
  | { kind: "done"; path: string; size: number }
  | { kind: "error"; text: string }
  | { kind: "end" };

let state: BuildState = { status: "idle", step: 0, stepStarted: 0, started: 0, log: [] };
const subs = new Set<() => void>();
const set = (s: Partial<BuildState>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

// El progreso vive fuera de la página para no perderlo al cambiar de sección.
if (inTauri) {
  listen<BuilderEvent>("builder", ({ payload: e }) => {
    if (e.kind === "step") set({ step: e.n, stepStarted: Date.now(), log: [...state.log, `▸ ${e.text}`].slice(-200) });
    else if (e.kind === "log") set({ log: [...state.log, e.text].slice(-200) });
    else if (e.kind === "done") set({ status: "done", result: { path: e.path, size: e.size } });
    else if (e.kind === "error") set({ status: "error", error: e.text });
    else if (e.kind === "end" && state.status === "running") set({ status: "cancelled" });
  }).catch(() => {});
}

export const builderStore = {
  get: () => state,
  set,
  begin: (iso: string, out: string) =>
    set({ status: "running", step: 0, started: Date.now(), stepStarted: Date.now(), log: [], error: undefined, result: undefined, iso, out }),
  reset: () => set({ status: "idle", step: 0, log: [], error: undefined, result: undefined }),
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useBuilder() {
  return useSyncExternalStore(builderStore.subscribe, builderStore.get);
}
