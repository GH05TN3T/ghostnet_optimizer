export function bytes(n: number, decimals = 1): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function rate(n: number): string {
  return `${bytes(n)}/s`;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function uptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  privacidad: "Privacidad",
  interfaz: "Interfaz",
  sistema: "Sistema",
  rendimiento: "Rendimiento y juegos",
  seguridad: "Seguridad (riesgo)",
};
