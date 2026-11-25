import { useEffect, useState, type ReactNode } from "react";
import type { PageId } from "../App";
import { RingIcon, Spark } from "../components/Charts";
import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconBox,
  IconBroom,
  IconChevron,
  IconCpu,
  IconDatabase,
  IconDisk,
  IconGauge,
  IconGpu,
  IconLeaf,
  IconMemory,
  IconMonitor,
  IconShield,
  IconSparkle,
  IconWand,
  IconWifi,
} from "../components/Icons";
import { api, errMsg, inTauri } from "../lib/api";
import { bytes, rate } from "../lib/format";
import { useStats, useToast } from "../lib/store";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

function HeroArt() {
  return (
    <svg className="hero__art" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="hbg" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#14111a" stopOpacity="0" />
          <stop offset="0.45" stopOpacity="0.55" style={{ stopColor: "var(--accent-deep)" }} />
          <stop offset="1" stopOpacity="0.95" style={{ stopColor: "var(--accent-deep)" }} />
        </linearGradient>
        <linearGradient id="hw1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopOpacity="0.9" style={{ stopColor: "var(--accent-hi)" }} />
          <stop offset="1" stopOpacity="0.2" style={{ stopColor: "var(--accent-2)" }} />
        </linearGradient>
        <linearGradient id="hw2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopOpacity="0.1" style={{ stopColor: "var(--accent-2)" }} />
          <stop offset="0.6" stopOpacity="0.55" style={{ stopColor: "var(--accent)" }} />
          <stop offset="1" stopOpacity="0.35" style={{ stopColor: "var(--accent-hi)" }} />
        </linearGradient>
        <linearGradient id="hw3" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopOpacity="0" style={{ stopColor: "var(--accent-deep)" }} />
          <stop offset="1" stopOpacity="0.95" style={{ stopColor: "var(--accent-deep)" }} />
        </linearGradient>
        <radialGradient id="hb" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="0.25" stopOpacity="0.35" style={{ stopColor: "var(--accent-soft)" }} />
          <stop offset="1" stopOpacity="0.05" style={{ stopColor: "var(--accent)" }} />
        </radialGradient>
        <filter id="hblur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width="1000" height="220" fill="url(#hbg)" />
      <ellipse cx="760" cy="200" rx="260" ry="70" opacity="0.35" filter="url(#hblur)" style={{ fill: "var(--accent)" }} />
      <path d="M380 220 C 520 150, 600 120, 700 130 S 880 90, 1000 60 L1000 220 Z" fill="url(#hw2)" />
      <path d="M440 220 C 560 170, 650 175, 740 150 S 900 120, 1000 125 L1000 220 Z" fill="url(#hw1)" opacity="0.75" />
      <path d="M520 220 C 640 195, 720 200, 820 180 S 950 170, 1000 175 L1000 220 Z" fill="url(#hw3)" />
      <path d="M380 220 C 520 150, 600 120, 700 130 S 880 90, 1000 60" fill="none" strokeOpacity="0.35" style={{ stroke: "var(--accent-soft)" }} />
      <circle cx="640" cy="92" r="26" fill="url(#hb)" strokeOpacity="0.35" style={{ stroke: "var(--accent-soft)" }} />
      <circle cx="585" cy="48" r="8" fill="url(#hb)" strokeOpacity="0.3" style={{ stroke: "var(--accent-soft)" }} />
      <circle cx="560" cy="168" r="11" fill="url(#hb)" strokeOpacity="0.3" style={{ stroke: "var(--accent-soft)" }} />
      <circle cx="505" cy="62" r="5" fill="url(#hb)" strokeOpacity="0.25" style={{ stroke: "var(--accent-soft)" }} />
      {[
        [540, 110],
        [690, 75],
        [770, 105],
      ].map(([x, y]) => (
        <path
          key={`${x}${y}`}
          d={`M${x} ${y - 6} L${x + 1.5} ${y - 1.5} L${x + 6} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 6} L${x - 1.5} ${y + 1.5} L${x - 6} ${y} L${x - 1.5} ${y - 1.5} Z`}
          fill="#ffffff"
          opacity="0.7"
        />
      ))}
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  ring,
  spark,
  tone,
  sparkMax,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  ring: number | null;
  spark: number[];
  tone?: "pink" | "blue";
  sparkMax?: number;
  onClick: () => void;
}) {
  return (
    <button className="stat" onClick={onClick}>
      <div className="stat__top">
        <RingIcon value={ring}>{icon}</RingIcon>
        <div className="stat__text">
          <small>{label}</small>
          <strong>{value}</strong>
          <span>{sub}</span>
        </div>
        <IconChevron size={15} className="stat__chev" />
      </div>
      <Spark data={spark} max={sparkMax} tone={tone} />
    </button>
  );
}

export default function Home({ go }: { go: (p: PageId) => void }) {
  const { stats, history, info } = useStats();
  const toast = useToast();
  const [ram, setRam] = useState(false);
  const [ping, setPing] = useState<{ ms: number | null; jitter: number | null } | null>(null);

  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    const run = () =>
      api
        .ping()
        .then((p) => alive && setPing(p))
        .catch(() => {});
    run();
    const t = window.setInterval(run, 6000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : null;
  const sysDisk = stats?.disks.find((d) => /^c:/i.test(d.mount)) ?? stats?.disks[0];
  const diskPct = sysDisk && sysDisk.total ? ((sysDisk.total - sysDisk.free) / sysDisk.total) * 100 : null;
  const total = stats?.disks.reduce((a, d) => a + d.total, 0) ?? 0;
  const free = stats?.disks.reduce((a, d) => a + d.free, 0) ?? 0;
  const usedPct = total ? ((total - free) / total) * 100 : 0;
  const gpuOk = !!stats && stats.gpu >= 0;

  const freeRam = async () => {
    setRam(true);
    try {
      const n = await api.cleanRam();
      toast(n > 0 ? `RAM liberada: ${bytes(n)}` : "La RAM ya estaba optimizada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRam(false);
    }
  };

  const actions: { label: string; sub: string; tone: string; icon: ReactNode; run: () => void }[] = [
    { label: "Limpieza", sub: "Borra basura", tone: "pink", icon: <IconBroom />, run: () => go("cleanup") },
    { label: "Debloat", sub: "Quita apps", tone: "purple", icon: <IconBox />, run: () => go("debloat") },
    { label: "Optimizar", sub: "Más rendimiento", tone: "orange", icon: <IconGauge />, run: () => go("optimize") },
    { label: "Comprimir", sub: "Ahorra espacio", tone: "blue", icon: <IconArchive />, run: () => go("compress") },
    { label: ram ? "Liberando…" : "Liberar RAM", sub: "Libera memoria", tone: "green", icon: <IconSparkle />, run: freeRam },
  ];

  return (
    <>
      <section className="hero">
        <HeroArt />
        <div className="hero__text">
          <small>
            {greeting()}
            {info ? `, ${info.user}` : ""}
          </small>
          <h1>Tu PC. Optimizado.</h1>
          <p>Limpio. Rápido. Ligero. A tu manera.</p>
          <button className="hero__cta" onClick={() => go("optimize")}>
            <IconWand size={17} />
            <span>Optimización rápida</span>
            <IconChevron size={16} />
          </button>
        </div>
        <div className="hero__side">
          <q>Un Windows más rápido y más limpio.</q>
          <div className="hero__perks">
            <div>
              <IconLeaf size={16} />
              <span>Más espacio</span>
            </div>
            <div>
              <IconGauge size={16} />
              <span>Más rendimiento</span>
            </div>
            <div>
              <IconShield size={16} />
              <span>Más control</span>
            </div>
          </div>
        </div>
      </section>

      <div className="stats">
        <StatCard
          icon={<IconCpu size={18} />}
          label="CPU"
          value={stats ? `${Math.round(stats.cpu)}%` : "—"}
          sub={stats ? `${(stats.freq_mhz / 1000).toFixed(2)} GHz` : "…"}
          ring={stats?.cpu ?? null}
          spark={history.cpu}
          sparkMax={100}
          onClick={() => go("gaming")}
        />
        <StatCard
          icon={<IconMemory size={18} />}
          label="RAM"
          value={ramPct == null ? "—" : `${Math.round(ramPct)}%`}
          sub={stats ? `${bytes(stats.ram_used)} / ${bytes(stats.ram_total, 0)}` : "…"}
          ring={ramPct}
          spark={history.ram}
          sparkMax={100}
          tone="blue"
          onClick={() => go("gaming")}
        />
        <StatCard
          icon={<IconDisk size={18} />}
          label={`Disco ${sysDisk?.mount.replace("\\", "") ?? ""}`}
          value={diskPct == null ? "—" : `${Math.round(diskPct)}%`}
          sub={sysDisk ? `${bytes(sysDisk.total - sysDisk.free)} / ${bytes(sysDisk.total)}` : "…"}
          ring={diskPct}
          spark={history.disk}
          onClick={() => go("cleanup")}
        />
        <StatCard
          icon={<IconGpu size={18} />}
          label="GPU"
          value={gpuOk ? `${Math.round(stats!.gpu)}%` : "—"}
          sub={info?.gpus[0]?.replace(/^(NVIDIA|AMD|Intel\(R\))\s*/i, "") ?? (stats && !gpuOk ? "No disponible" : "…")}
          ring={gpuOk ? stats!.gpu : null}
          spark={history.gpu}
          sparkMax={100}
          onClick={() => go("gaming")}
        />
      </div>

      <div className="home-row">
        <section className="panel net">
          <header className="panel__head">
            <IconWifi size={16} />
            <h3>Red</h3>
          </header>
          <div className="net__cols">
            <div>
              <div className="net__val">
                <IconArrowDown size={15} className="tone-pink" />
                <div>
                  <strong>{stats ? rate(stats.net_down) : "—"}</strong>
                  <small>Descarga</small>
                </div>
              </div>
              <Spark data={history.down} height={70} />
            </div>
            <div>
              <div className="net__val">
                <IconArrowUp size={15} className="tone-blue" />
                <div>
                  <strong>{stats ? rate(stats.net_up) : "—"}</strong>
                  <small>Subida</small>
                </div>
              </div>
              <Spark data={history.up} height={70} tone="blue" />
            </div>
          </div>
          <footer className="net__foot">
            <div>
              <small>Ping</small>
              <strong>{ping?.ms != null ? `${ping.ms.toFixed(1)} ms` : "—"}</strong>
            </div>
            <div>
              <small>Jitter</small>
              <strong>{ping?.jitter != null ? `${ping.jitter.toFixed(1)} ms` : "—"}</strong>
            </div>
          </footer>
        </section>

        <section className="panel">
          <header className="panel__head">
            <IconMonitor size={16} />
            <h3>Información del sistema</h3>
          </header>
          <ul className="sysinfo">
            <li>
              <IconMonitor size={14} />
              <span>Sistema</span>
              <b>{info ? `${info.os} ${info.version}` : "…"}</b>
            </li>
            <li>
              <IconBox size={14} />
              <span>Placa base</span>
              <b>{info?.board || "—"}</b>
            </li>
            <li>
              <IconCpu size={14} />
              <span>Procesador</span>
              <b>{info?.cpu.replace(/\s*\d+-Core Processor/i, "") ?? "…"}</b>
            </li>
            <li>
              <IconGpu size={14} />
              <span>Gráfica</span>
              <b>{info?.gpus[0] ?? "…"}</b>
            </li>
            <li>
              <IconMemory size={14} />
              <span>Memoria</span>
              <b>{info ? `${bytes(info.ram_total, 0)}${info.ram_speed ? ` · ${info.ram_speed} MT/s` : ""}` : "…"}</b>
            </li>
            <li>
              <IconWifi size={14} />
              <span>Compilación</span>
              <b>{info?.build ?? "…"}</b>
            </li>
          </ul>
        </section>

        <section className="panel storage">
          <header className="panel__head">
            <IconDatabase size={16} />
            <h3>Almacenamiento</h3>
            <small>
              {bytes(free)} libres de {bytes(total)}
            </small>
          </header>
          <div className="storage__bar">
            <div style={{ width: `${usedPct}%` }} />
          </div>
          <div className="storage__legend">
            <span>
              <i className="dot-pink" /> Usado {bytes(total - free)}
            </span>
            <span>
              <i className="dot-blue" /> Libre {bytes(free)}
            </span>
          </div>
          <div className="storage__disks">
            {stats?.disks.map((d) => (
              <div key={d.mount}>
                <b>{d.mount.replace("\\", "")}</b>
                <div className="storage__mini">
                  <div style={{ width: `${d.total ? ((d.total - d.free) / d.total) * 100 : 0}%` }} />
                </div>
                <small>{bytes(d.free)}</small>
              </div>
            ))}
          </div>
          <button className="storage__cta" onClick={() => go("cleanup")}>
            <span className="storage__cta-icon">
              <IconDatabase size={16} />
            </span>
            <div>
              <strong>Liberar espacio</strong>
              <small>Busca y elimina archivos innecesarios</small>
            </div>
            <span className="storage__cta-go">
              <IconChevron size={15} />
            </span>
          </button>
        </section>
      </div>

      <section className="panel">
        <header className="panel__head">
          <IconSparkle size={16} />
          <h3>Acciones rápidas</h3>
          <span className="panel__hint">Tareas comunes, a un clic</span>
        </header>
        <div className="actions">
          {actions.map((a) => (
            <button key={a.label} className={`action action--${a.tone}`} onClick={a.run}>
              <span className="action__icon">{a.icon}</span>
              <div>
                <strong>{a.label}</strong>
                <small>{a.sub}</small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
