import { useCallback, useEffect, useMemo, useState } from "react";
import { Spark } from "../components/Charts";
import { PageHero, Perks } from "../components/Hero";
import {
  IconBolt,
  IconChevron,
  IconFps,
  IconGamepad,
  IconGpu,
  IconRocket,
  IconSearch,
  IconShield,
  IconSparkle,
  IconWrench,
  IconX,
} from "../components/Icons";
import { Badge, Bar, Toggle } from "../components/ui";
import { api, errMsg, POWER, type Game, type TweakInfo } from "../lib/api";
import { bytes, rate } from "../lib/format";
import { useStats, useToast, useTweaks } from "../lib/store";
import { ensurePerformancePlan, gpuVendor } from "./Optimize";

const BOOST_KEY = "ghostnet.boost.prevPlan";
const getPrev = () => {
  try {
    return localStorage.getItem(BOOST_KEY);
  } catch {
    return null;
  }
};
const setPrev = (v: string | null) => {
  try {
    if (v) localStorage.setItem(BOOST_KEY, v);
    else localStorage.removeItem(BOOST_KEY);
  } catch {
    /* sin almacenamiento */
  }
};

const VENDORS = [
  { id: "nvidia", label: "NVIDIA" },
  { id: "amd", label: "AMD" },
  { id: "intel", label: "Intel" },
  { id: "other", label: "Otra / virtual" },
];

function MiniStat({
  label,
  value,
  sub,
  data,
  tone,
  max,
}: {
  label: string;
  value: number | null;
  sub: string;
  data: number[];
  tone?: "pink" | "blue";
  max?: number;
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="gstat">
      <div className="gstat__ring">
        <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="30" cy="30" r={r} className="ring-icon__track" strokeWidth="4" fill="none" />
          <circle
            cx="30"
            cy="30"
            r={r}
            className="ring-icon__value"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * v) / 100} ${c}`}
          />
        </svg>
        <b>{value == null ? "—" : `${Math.round(v)}%`}</b>
      </div>
      <div className="gstat__body">
        <strong>{label}</strong>
        <small>{sub}</small>
        <Spark data={data} max={max} tone={tone} height={30} />
      </div>
    </div>
  );
}

function CompactTweak({ t }: { t: TweakInfo }) {
  const { state, busy, set } = useTweaks();
  return (
    <div className="ctweak">
      <div>
        <strong>{t.name}</strong>
        <small>
          {t.recommended && <span className="tone-pink">Recomendado · </span>}
          {t.desc}
        </small>
      </div>
      <Toggle on={!!state[t.id]} busy={busy.has(t.id)} onChange={(v) => set([t.id], v)} />
    </div>
  );
}

export default function Gaming() {
  const { stats, history, info } = useStats();
  const tw = useTweaks();
  const toast = useToast();
  const [boosting, setBoosting] = useState(false);
  const [boosted, setBoosted] = useState(() => !!getPrev());
  const [ramBusy, setRamBusy] = useState(false);
  const [games, setGames] = useState<Game[] | null>(null);
  const [gq, setGq] = useState("");
  const [gBusy, setGBusy] = useState<string | null>(null);
  const [vendor, setVendor] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [killing, setKilling] = useState<string | null>(null);

  const detected = gpuVendor(info?.gpus) ?? "other";
  const gv = vendor ?? detected;

  const loadGames = useCallback(async () => {
    try {
      setGames(await api.gamesList());
    } catch (e) {
      setGames([]);
      toast(errMsg(e), "error");
    }
  }, [toast]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const gamingTweaks = tw.list.filter((t) => t.category === "rendimiento");
  const gpuTweaks = tw.list.filter((t) => t.category === "gpu" && (!t.vendor || t.vendor === gv));
  const recPending = gamingTweaks.filter((t) => t.recommended && !tw.state[t.id]);
  const activeCount = gamingTweaks.filter((t) => tw.state[t.id]).length;

  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : null;
  const sys = stats?.disks.find((d) => /^c:/i.test(d.mount)) ?? stats?.disks[0];
  const diskPct = sys && sys.total ? ((sys.total - sys.free) / sys.total) * 100 : null;

  const filteredGames = useMemo(() => {
    const n = gq.trim().toLowerCase();
    return (games ?? []).filter((g) => !n || g.name.toLowerCase().includes(n));
  }, [games, gq]);

  const toggleBoost = async (on: boolean) => {
    setBoosting(true);
    try {
      if (on) {
        const current = (await api.powerPlans()).find((p) => p.active);
        setPrev(current?.guid ?? POWER.balanced);
        await ensurePerformancePlan();
        const freed = await api.cleanRam();
        setBoosted(true);
        toast(`Modo juego activado · Máximo rendimiento · ${bytes(Math.max(0, freed))} de RAM liberada`);
      } else {
        await api.powerSetActive(getPrev() ?? POWER.balanced);
        setPrev(null);
        setBoosted(false);
        toast("Modo juego desactivado: plan de energía restaurado");
      }
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBoosting(false);
    }
  };

  const freeRam = async () => {
    setRamBusy(true);
    try {
      const n = await api.cleanRam();
      toast(n > 0 ? `RAM liberada: ${bytes(n)}` : "La RAM ya estaba optimizada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRamBusy(false);
    }
  };

  const optimizeGame = async (g: Game) => {
    setGBusy(g.exe);
    try {
      await api.gameOptimize(g.exe, !g.optimized);
      setGames((l) => l?.map((x) => (x.exe === g.exe ? { ...x, optimized: !g.optimized } : x)) ?? null);
      toast(g.optimized ? `${g.name}: optimización quitada` : `${g.name} optimizado: GPU dedicada, pantalla completa real y prioridad alta`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setGBusy(null);
    }
  };

  const applyGaming = async () => {
    setApplying(true);
    const ids = [...recPending, ...gpuTweaks.filter((t) => t.recommended && !tw.state[t.id])].map((t) => t.id);
    const ok = ids.length ? await tw.set(ids, true) : true;
    setApplying(false);
    if (ok) toast(ids.length ? `${ids.length} ajustes para juegos aplicados` : "Ya estaba todo aplicado");
  };

  const kill = async (name: string) => {
    setKilling(name);
    try {
      const n = await api.killProcess(name);
      toast(n ? `${name} cerrado (${n} ${n === 1 ? "proceso" : "procesos"})` : `No se pudo cerrar ${name}`, n ? "ok" : "error");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setKilling(null);
    }
  };

  return (
    <>
      <PageHero
        eyebrow="Modo juego"
        title="Juega sin límites"
        subtitle="Optimiza el equipo para sacar el máximo rendimiento en tus partidas."
        art="nebula"
        side={
          <div className="ghero-side">
            <Perks
              items={[
                { icon: <IconBolt size={15} />, title: "Menos latencia" },
                { icon: <IconFps size={15} />, title: "Más FPS" },
                { icon: <IconSparkle size={15} />, title: "Partidas más fluidas" },
                { icon: <IconShield size={15} />, title: "Más estabilidad" },
              ]}
            />
            <span className="fps-tag">+FPS</span>
          </div>
        }
      >
        <div className="mode-tiles">
          <div className="mode-tile">
            <IconGamepad size={20} />
            <div>
              <strong>Modo juego</strong>
              <small>{boosted ? "Activo · Máximo rendimiento" : "Desactivado"}</small>
            </div>
            <Toggle on={boosted} busy={boosting} onChange={toggleBoost} />
          </div>
          <button className="mode-tile mode-tile--btn" onClick={freeRam} disabled={ramBusy}>
            <IconRocket size={20} />
            <div>
              <strong>Liberar RAM</strong>
              <small>{ramBusy ? "Liberando…" : stats ? `${bytes(stats.ram_used)} en uso` : "Vacía memoria sin usar"}</small>
            </div>
            {ramBusy ? <span className="spinner spinner--sm" /> : <IconChevron size={16} />}
          </button>
        </div>
      </PageHero>

      <div className="stats">
        <MiniStat label="CPU" value={stats?.cpu ?? null} sub={stats ? `${stats.freq_mhz} MHz` : "…"} data={history.cpu} max={100} />
        <MiniStat
          label="RAM"
          value={ramPct}
          sub={stats ? `${bytes(stats.ram_used)} / ${bytes(stats.ram_total, 0)}` : "…"}
          data={history.ram}
          max={100}
          tone="blue"
        />
        <MiniStat
          label="GPU"
          value={stats && stats.gpu >= 0 ? stats.gpu : null}
          sub={info?.gpus[0]?.replace(/^(NVIDIA|AMD|Intel\(R\))\s*/i, "") ?? "…"}
          data={history.gpu}
          max={100}
        />
        <MiniStat label="Disco" value={diskPct} sub={sys ? `${bytes(sys.total - sys.free)} / ${bytes(sys.total)}` : "…"} data={history.disk} />
      </div>

      <div className="gcols">
        <section className="panel gpanel">
          <header className="panel__head">
            <IconGamepad size={16} />
            <h3>Optimizar juegos</h3>
            <small>{games ? `${games.filter((g) => g.optimized).length}/${games.length} optimizados` : ""}</small>
          </header>
          <div className="search search--sm">
            <IconSearch size={15} />
            <input placeholder="Buscar juegos…" value={gq} onChange={(e) => setGq(e.target.value)} />
          </div>
          <div className="glist">
            {games == null && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}
            {games?.length === 0 && <p className="muted small">No se encontraron juegos de Steam, Epic, Rockstar ni FiveM.</p>}
            {filteredGames.map((g) => (
              <div key={g.exe} className="gitem" title={g.exe}>
                <span className="gitem__cover">{g.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{g.name}</strong>
                  <small>{g.source}</small>
                </div>
                {g.optimized && <Badge kind="ok">Optimizado</Badge>}
                <button
                  className={`icon-btn icon-btn--tool ${g.optimized ? "is-on" : ""}`}
                  title={g.optimized ? "Quitar optimización" : "Optimizar: GPU dedicada, pantalla completa real y prioridad alta"}
                  disabled={gBusy === g.exe}
                  onClick={() => optimizeGame(g)}
                >
                  {gBusy === g.exe ? <span className="spinner spinner--sm" /> : <IconWrench size={15} />}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel gpanel">
          <header className="panel__head">
            <IconGpu size={16} />
            <h3>Optimizar GPU</h3>
          </header>
          <div className="radios">
            {VENDORS.map((v) => (
              <button key={v.id} className={`radio ${gv === v.id ? "is-sel" : ""}`} onClick={() => setVendor(v.id)}>
                <span className="radio__dot" />
                {v.label}
                {detected === v.id && <small>detectada</small>}
              </button>
            ))}
          </div>
          <div className="ctweaks">
            {gpuTweaks.map((t) => (
              <CompactTweak key={t.id} t={t} />
            ))}
          </div>
        </section>

        <section className="panel gpanel">
          <header className="panel__head">
            <IconBolt size={16} />
            <h3>Ajustes para juegos</h3>
            <small>
              {activeCount} de {gamingTweaks.length} activos
            </small>
          </header>
          <div className="ctweaks ctweaks--scroll">
            {gamingTweaks.map((t) => (
              <CompactTweak key={t.id} t={t} />
            ))}
          </div>
          <button className="cta-big" onClick={applyGaming} disabled={applying}>
            {applying ? <span className="spinner" /> : <IconRocket size={17} />}
            <span>Aplicar optimización para juegos</span>
            <IconChevron size={16} />
          </button>
        </section>
      </div>

      <section className="panel">
        <header className="panel__head">
          <IconSparkle size={16} />
          <h3>Lo que más RAM usa ahora</h3>
          <small>
            Disco {stats ? rate(stats.disk_read + stats.disk_write) : "—"} · Red ↓ {stats ? rate(stats.net_down) : "—"}
          </small>
        </header>
        <div className="procs-grid">
          {stats?.top.map((p) => (
            <div key={p.pid} className="proc">
              <div>
                <strong title={p.name}>{p.name.replace(/\.exe$/i, "")}</strong>
                <small>
                  {bytes(p.mem)} · CPU {p.cpu.toFixed(1)}%
                </small>
                <Bar value={stats.ram_total ? (p.mem / stats.ram_total) * 400 : 0} />
              </div>
              <button className="icon-btn" title="Cerrar proceso" disabled={killing === p.name} onClick={() => kill(p.name)}>
                <IconX size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
