import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { inTauri } from "./api";

export interface DriversState {
  status: "idle" | "searching" | "working" | "done" | "error";
  found: number;
  index: number;
  current: string;
  phase: "download" | "install" | "";
  installed: number;
  reboot: boolean;
  error?: string;
  /** Líneas de resultado por driver (para la lista). */
  log: { title: string; ok: boolean }[];
}

type Ev =
  | { kind: "searching" }
  | { kind: "found"; count: number }
  | { kind: "item"; title: string; index: number; total: number }
  | { kind: "phase"; phase: "download" | "install" }
  | { kind: "installed"; title: string; ok: boolean }
  | { kind: "done"; installed: number; reboot: boolean }
  | { kind: "error"; text: string }
  | { kind: "end" };

const initial: DriversState = { status: "idle", found: 0, index: 0, current: "", phase: "", installed: 0, reboot: false, log: [] };
let state: DriversState = initial;
const subs = new Set<() => void>();
const set = (s: Partial<DriversState>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

if (inTauri) {
  listen<Ev>("drivers", ({ payload: e }) => {
    if (e.kind === "searching") set({ status: "searching", current: "" });
    else if (e.kind === "found") set({ found: e.count, status: e.count === 0 ? state.status : "working" });
    else if (e.kind === "item") set({ status: "working", index: e.index, found: e.total, current: e.title, phase: "" });
    else if (e.kind === "phase") set({ phase: e.phase });
    else if (e.kind === "installed") set({ log: [...state.log, { title: e.title, ok: e.ok }].slice(-60) });
    else if (e.kind === "done") set({ status: "done", installed: e.installed, reboot: e.reboot, current: "", phase: "" });
    else if (e.kind === "error") set({ status: "error", error: e.text });
    // "end" no cambia el estado: lo fija "done" o "error".
  }).catch(() => {});
}

export const driversStore = {
  get: () => state,
  begin: () => set({ ...initial, status: "searching" }),
  reset: () => set(initial),
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  },
};

export function useDrivers() {
  return useSyncExternalStore(driversStore.subscribe, driversStore.get);
}

/** Enlace a la página de drivers del fabricante, según el modelo detectado. */
export function vendorLink(manufacturer: string, model: string): { name: string; url: string } | null {
  const m = manufacturer.toLowerCase();
  const q = encodeURIComponent(`${manufacturer} ${model}`.trim());
  if (m.includes("micro-star") || m.includes("msi")) return { name: "MSI", url: "https://www.msi.com/support/download" };
  if (m.includes("dell")) return { name: "Dell", url: "https://www.dell.com/support/home/drivers" };
  if (m.includes("hp") || m.includes("hewlett")) return { name: "HP", url: "https://support.hp.com/us-en/drivers" };
  if (m.includes("lenovo")) return { name: "Lenovo", url: "https://pcsupport.lenovo.com/" };
  if (m.includes("asus")) return { name: "ASUS", url: "https://www.asus.com/support/download-center/" };
  if (m.includes("acer")) return { name: "Acer", url: "https://www.acer.com/us-en/support/drivers-and-manuals" };
  if (m.includes("gigabyte")) return { name: "Gigabyte", url: "https://www.gigabyte.com/Support" };
  if (m.includes("razer")) return { name: "Razer", url: "https://mysupport.razer.com/app/warranty" };
  if (m.includes("samsung")) return { name: "Samsung", url: "https://www.samsung.com/us/support/downloads/" };
  if (m.includes("microsoft")) return { name: "Microsoft", url: "https://support.microsoft.com/surface/download-drivers-and-firmware-for-surface" };
  if (m.includes("toshiba") || m.includes("dynabook")) return { name: "Dynabook", url: "https://support.dynabook.com/drivers" };
  if (m.includes("huawei")) return { name: "Huawei", url: "https://consumer.huawei.com/en/support/" };
  // Sin fabricante conocido: buscador general.
  return { name: "Buscar en Google", url: `https://www.google.com/search?q=${q}+drivers` };
}
