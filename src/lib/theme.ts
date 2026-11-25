import { useSyncExternalStore } from "react";

/** Colores de cada tema. `rgb` es el acento principal; el resto se usa en degradados y textos. */
export interface ThemeColors {
  rgb: [number, number, number];
  hi: string;
  dark: string;
  soft: string;
  deep: string;
  on: string;
}

export interface ThemePreset extends ThemeColors {
  id: string;
  name: string;
}

export const PRESETS: ThemePreset[] = [
  { id: "rosa", name: "Rosa", rgb: [232, 51, 109], hi: "#ef3f77", dark: "#b8195a", soft: "#ff8fb4", deep: "#4d1030", on: "#ffffff" },
  { id: "rojo", name: "Rojo", rgb: [229, 57, 53], hi: "#f0534f", dark: "#b71c1c", soft: "#ff9a97", deep: "#4a1010", on: "#ffffff" },
  { id: "naranja", name: "Naranja", rgb: [249, 115, 22], hi: "#fb8a3c", dark: "#c2410c", soft: "#fdba8c", deep: "#4a1f06", on: "#ffffff" },
  { id: "dorado", name: "Dorado", rgb: [234, 179, 8], hi: "#facc15", dark: "#a16207", soft: "#fde68a", deep: "#3d2e04", on: "#111111" },
  { id: "verde", name: "Verde", rgb: [34, 197, 94], hi: "#3ddc84", dark: "#15803d", soft: "#8ff0b3", deep: "#0b3a1f", on: "#ffffff" },
  { id: "cian", name: "Cian", rgb: [6, 182, 212], hi: "#22d3ee", dark: "#0e7490", soft: "#8be9f7", deep: "#083a45", on: "#ffffff" },
  { id: "azul", name: "Azul", rgb: [59, 130, 246], hi: "#5b9bff", dark: "#1d4ed8", soft: "#9cc2ff", deep: "#0f2552", on: "#ffffff" },
  { id: "morado", name: "Morado", rgb: [147, 84, 255], hi: "#a874ff", dark: "#6a2fd6", soft: "#c9a8ff", deep: "#2e1656", on: "#ffffff" },
  { id: "blanco", name: "Blanco y negro", rgb: [236, 236, 240], hi: "#ffffff", dark: "#b9b9c2", soft: "#e4e4ea", deep: "#2a2a30", on: "#0a0a0f" },
];

const KEY = "ghostnet.theme";

interface Saved {
  id: string;
  custom?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

/** Genera los tonos de un tema a partir de un único color. */
export function fromColor(hex: string): ThemeColors {
  const rgb = hexToRgb(hex);
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return {
    rgb,
    hi: toHex(mix(rgb, [255, 255, 255], 0.12)),
    dark: toHex(mix(rgb, [0, 0, 0], 0.25)),
    soft: toHex(mix(rgb, [255, 255, 255], 0.5)),
    deep: toHex(mix(rgb, [0, 0, 0], 0.7)),
    on: lum > 0.62 ? "#0a0a0f" : "#ffffff",
  };
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v.id === "string") return v;
  } catch {
    /* sin almacenamiento */
  }
  return { id: "rosa" };
}

let current: Saved = load();
const subs = new Set<() => void>();

function colorsOf(s: Saved): ThemeColors {
  if (s.id === "custom" && s.custom) return fromColor(s.custom);
  return PRESETS.find((p) => p.id === s.id) ?? PRESETS[0];
}

export function applyTheme(s: Saved = current) {
  const c = colorsOf(s);
  const r = document.documentElement.style;
  r.setProperty("--accent-rgb", c.rgb.join(" "));
  r.setProperty("--accent-hi", c.hi);
  r.setProperty("--accent-2", c.dark);
  r.setProperty("--accent-soft", c.soft);
  r.setProperty("--accent-deep", c.deep);
  r.setProperty("--on-accent", c.on);
}

export function setTheme(s: Saved) {
  current = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento */
  }
  applyTheme(s);
  subs.forEach((f) => f());
}

export function useTheme() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => current,
  );
}
