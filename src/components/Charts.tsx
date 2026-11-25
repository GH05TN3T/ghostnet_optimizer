import { useId } from "react";
import type React from "react";

/** Medidor circular. value 0-100, o null si no hay dato. */
export function Ring({
  value,
  label,
  sub,
  size = 132,
  score,
}: {
  value: number | null;
  label: string;
  sub?: string;
  size?: number;
  /** Modo puntuación: sin "%" y con colores invertidos (alto = bien). */
  score?: boolean;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75; // 270°
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const kind = score
    ? v >= 75 ? "ok" : v >= 55 ? "warn" : "danger"
    : v >= 90 ? "danger" : v >= 75 ? "warn" : "ok";
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="ring__track"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={`ring__value ring__value--${kind}`}
          strokeWidth={stroke}
          strokeDasharray={`${(arc * v) / 100} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="ring__text">
        <strong>{value == null ? "—" : score ? Math.round(v) : `${Math.round(v)}%`}</strong>
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

/** Gráfico de área simple. Si se pasa `b`, dibuja una segunda serie (p. ej. subida). */
export function Area({
  a,
  b,
  max,
  height = 90,
  points = 60,
}: {
  a: number[];
  b?: number[];
  max?: number;
  height?: number;
  points?: number;
}) {
  const id = useId().replace(/:/g, "");
  const w = 300;
  const h = height;
  const top = Math.max(max ?? 0, ...a, ...(b ?? []), 1);
  const path = (arr: number[]) => {
    if (arr.length < 2) return "";
    const step = w / (points - 1);
    const off = (points - arr.length) * step;
    return arr
      .map((v, i) => `${i === 0 ? "M" : "L"}${(off + i * step).toFixed(1)},${(h - (v / top) * (h - 4)).toFixed(1)}`)
      .join(" ");
  };
  const fill = (arr: number[]) => {
    const p = path(arr);
    if (!p) return "";
    const step = w / (points - 1);
    const off = (points - arr.length) * step;
    return `${p} L${w},${h} L${off.toFixed(1)},${h} Z`;
  };
  return (
    <svg className="area" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} className="area__grid" />
      ))}
      <path d={fill(a)} fill={`url(#g${id})`} className="area__a" />
      <path d={path(a)} fill="none" className="area__a area__line" />
      {b && <path d={path(b)} fill="none" className="area__b area__line" />}
    </svg>
  );
}

/** Mini-gráfica para el pie de las tarjetas. */
export function Spark({
  data,
  max,
  tone = "pink",
  height = 34,
}: {
  data: number[];
  max?: number;
  tone?: "pink" | "blue" | "green";
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  // Se estira a todo el ancho desde el primer segundo (no espera a tener 60 muestras).
  const points = Math.max(data.length, 2);
  const w = 300;
  const h = height;
  const top = Math.max(max ?? 0, ...data, 1);
  const step = w / (points - 1);
  const off = (points - data.length) * step;
  const pts = data.map((v, i) => [off + i * step, h - 2 - (v / top) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fill = pts.length > 1 ? `${line} L${w},${h} L${off.toFixed(1)},${h} Z` : "";
  return (
    <svg className={`spark spark--${tone}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={`s${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 && (
        <>
          <path d={fill} fill={`url(#s${id})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** Anillo pequeño con un icono dentro (cabecera de las tarjetas de uso). */
export function RingIcon({ value, children, size = 52 }: { value: number | null; children: React.ReactNode; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring-icon" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="ring-icon__track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="ring-icon__value"
          strokeWidth={stroke}
          strokeDasharray={`${(c * v) / 100} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="ring-icon__inner">{children}</div>
    </div>
  );
}
