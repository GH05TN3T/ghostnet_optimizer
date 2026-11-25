import type { ReactNode } from "react";

export type HeroArt = "nebula" | "orbit" | "toggles" | "sliders" | "tiles";

const STARS = [
  [610, 40],
  [760, 150],
  [905, 55],
  [690, 95],
  [960, 160],
];

function Star({ x, y, s = 5 }: { x: number; y: number; s?: number }) {
  return (
    <path
      d={`M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25} Z`}
      fill="#fff"
      opacity="0.65"
    />
  );
}

function Art({ kind }: { kind: HeroArt }) {
  return (
    <svg className="phero__art" viewBox="0 0 1000 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
      <defs>
        <linearGradient id="ph-bg" x1="0" x2="1">
          <stop offset="0.25" stopColor="#120f17" stopOpacity="0" />
          <stop offset="1" stopColor="#4d1030" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="ph-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff4f8b" stopOpacity="0.75" />
          <stop offset="1" stopColor="#e8336d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ph-pink" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ff5b93" />
          <stop offset="1" stopColor="#a8154f" />
        </linearGradient>
        <filter id="ph-blur">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>
      <rect width="1000" height="200" fill="url(#ph-bg)" />
      <ellipse cx="790" cy="110" rx="230" ry="70" fill="url(#ph-glow)" filter="url(#ph-blur)" opacity="0.8" />

      {kind === "nebula" && (
        <g filter="url(#ph-blur)">
          <ellipse cx="640" cy="80" rx="160" ry="40" fill="#e8336d" opacity="0.45" transform="rotate(-12 640 80)" />
          <ellipse cx="760" cy="60" rx="110" ry="30" fill="#ff7aa6" opacity="0.35" />
          <ellipse cx="560" cy="130" rx="120" ry="28" fill="#8a1d55" opacity="0.6" />
        </g>
      )}

      {kind === "orbit" && (
        <g className="ph-fig" fill="none" stroke="#ff9cc0" strokeOpacity="0.55" strokeWidth="1.5">
          <ellipse cx="640" cy="100" rx="120" ry="34" transform="rotate(-18 640 100)" />
          <ellipse cx="640" cy="100" rx="120" ry="34" transform="rotate(28 640 100)" />
          <ellipse cx="640" cy="100" rx="120" ry="34" transform="rotate(80 640 100)" />
          <circle cx="640" cy="100" r="22" fill="url(#ph-pink)" stroke="none" opacity="0.9" />
          <circle cx="532" cy="132" r="5" fill="#fff" stroke="none" />
          <circle cx="730" cy="60" r="4" fill="#fff" stroke="none" />
          <circle cx="620" cy="190" r="4" fill="#fff" stroke="none" />
        </g>
      )}

      {kind === "toggles" && (
        <g className="ph-fig">
          {[
            [470, 50, 1, 120],
            [430, 115, 0, 80],
            [530, 120, 1, 90],
          ].map(([x, y, on, w], i) => (
            <g key={i} opacity={0.95 - i * 0.15}>
              <rect x={x} y={y} width={w} height={w * 0.42} rx={w * 0.21} fill={on ? "url(#ph-pink)" : "#2a2a33"} stroke="#ffffff" strokeOpacity="0.12" />
              <circle cx={on ? x + w - w * 0.21 : x + w * 0.21} cy={y + w * 0.21} r={w * 0.16} fill="#f3f3f6" />
            </g>
          ))}
        </g>
      )}

      {kind === "sliders" && (
        <g className="ph-fig">
          {[
            [60, 0.75],
            [100, 0.45],
            [140, 0.6],
          ].map(([y, v], i) => (
            <g key={i}>
              <rect x="440" y={y - 4} width="200" height="8" rx="4" fill="#2a2a33" />
              <rect x="440" y={y - 4} width={200 * v} height="8" rx="4" fill="url(#ph-pink)" />
              <circle cx={440 + 200 * v} cy={y} r="11" fill="#f3f3f6" />
            </g>
          ))}
        </g>
      )}

      {kind === "tiles" && (
        <g className="ph-fig">
          {Array.from({ length: 18 }).map((_, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            const pink = [1, 4, 8, 13, 15].includes(i);
            const x = 560 + col * 70 - row * 18;
            const y = 18 + row * 62;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width="54"
                height="50"
                rx="12"
                fill={pink ? "url(#ph-pink)" : "#22222b"}
                stroke="#ffffff"
                strokeOpacity={pink ? 0.25 : 0.08}
                opacity={pink ? 0.95 : 0.85}
              />
            );
          })}
        </g>
      )}

      {STARS.map(([x, y]) => (
        <Star key={`${x}${y}`} x={x} y={y} />
      ))}
    </svg>
  );
}

export function PageHero({
  icon,
  eyebrow,
  title,
  subtitle,
  art = "nebula",
  side,
  children,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  art?: HeroArt;
  side?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="phero">
      <Art kind={art} />
      <div className="phero__main">
        {icon && <div className="phero__icon">{icon}</div>}
        <div>
          {eyebrow && <small className="phero__eyebrow">{eyebrow}</small>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children && <div className="phero__extra">{children}</div>}
        </div>
      </div>
      {side && <div className="phero__side">{side}</div>}
    </section>
  );
}

/** Lista de ventajas con icono, para el lado derecho del héroe. */
export function Perks({ items }: { items: { icon: ReactNode; title: string; sub?: string }[] }) {
  return (
    <div className="perks">
      {items.map((p) => (
        <div key={p.title} className="perks__item">
          <span className="perks__icon">{p.icon}</span>
          <div>
            <strong>{p.title}</strong>
            {p.sub && <small>{p.sub}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}
