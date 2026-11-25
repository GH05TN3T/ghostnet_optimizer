import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { inTauri } from "./api";

export interface DownloadState {
  status: "idle" | "running" | "done" | "error" | "cancelled";
  file?: string;
  done: number;
  total: number;
  speed: number;
  started: number;
  error?: string;
}

type Ev =
  | { kind: "file"; path: string }
  | { kind: "progress"; done: number; total: number }
  | { kind: "done"; path: string; size: number }
  | { kind: "error"; text: string }
  | { kind: "end" };

let state: DownloadState = { status: "idle", done: 0, total: 0, speed: 0, started: 0 };
let last = { t: 0, b: 0 };
const subs = new Set<() => void>();
const set = (s: Partial<DownloadState>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};
const doneListeners = new Set<(path: string) => void>();

if (inTauri) {
  listen<Ev>("isodl", ({ payload: e }) => {
    if (e.kind === "file") set({ file: e.path });
    else if (e.kind === "progress") {
      const now = Date.now();
      let speed = state.speed;
      if (last.t && now > last.t) {
        const inst = ((e.done - last.b) * 1000) / (now - last.t);
        speed = speed ? speed * 0.7 + inst * 0.3 : inst;
      }
      last = { t: now, b: e.done };
      set({ done: e.done, total: e.total, speed: Math.max(0, speed) });
    } else if (e.kind === "done") {
      set({ status: "done", file: e.path, done: e.size, total: e.size });
      doneListeners.forEach((f) => f(e.path));
    } else if (e.kind === "error") set({ status: "error", error: e.text });
    else if (e.kind === "end" && state.status === "running") set({ status: "cancelled" });
  }).catch(() => {});
}

export const isoStore = {
  get: () => state,
  set,
  begin: () => {
    last = { t: 0, b: 0 };
    set({ status: "running", file: undefined, done: 0, total: 0, speed: 0, started: Date.now(), error: undefined });
  },
  reset: () => set({ status: "idle", done: 0, total: 0, speed: 0, error: undefined }),
  onDone: (f: (path: string) => void) => {
    doneListeners.add(f);
    return () => {
      doneListeners.delete(f);
    };
  },
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useIsoDownload() {
  return useSyncExternalStore(isoStore.subscribe, isoStore.get);
}
