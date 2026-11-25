import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PageId } from "../App";
import { Ring } from "../components/Charts";
import { PageHero } from "../components/Hero";
import {
  IconBolt,
  IconBox,
  IconBroom,
  IconCheck,
  IconGrid,
  IconMemory,
  IconRefresh,
  IconRocket,
  IconShield,
  IconSliders,
  IconSparkle,
} from "../components/Icons";
import { CATEGORY_ICON, TweakCard } from "../components/TweakCard";
import { Badge, Bar, Button } from "../components/ui";
import { api, errMsg, POWER, type BloatApp, type Category, type JunkCategory, type PowerPlan, type StartupItem } from "../lib/api";
import { bytes, CATEGORY_LABEL } from "../lib/format";
import { useStats, useToast, useTweaks } from "../lib/store";

interface Scan {
  junk: JunkCategory[];
  startup: StartupItem[];
  bloat: BloatApp[];
  plans: PowerPlan[];
}

interface Rec {
  id: string;
  icon: ReactNode;
  title: string;
  detail: string;
  points: number;
  action?: { label: string; run: () => Promise<unknown> | void; auto: boolean };
}

const GB = 1024 ** 3;
const SECTIONS: Category[] = ["rendimiento", "privacidad", "interfaz", "sistema", "gpu"];

export async function ensurePerformancePlan() {
  const plans = await api.powerPlans();
  let target = plans.find((p) => /m[aá]ximo|ultimate/i.test(p.name))?.guid;
  if (!target) {
    try {
      target = await api.powerAdd("ultimate");
    } catch {
      target = plans.find((p) => p.guid === POWER.high)?.guid ?? (await api.powerAdd("high"));
    }
  }
  await api.powerSetActive(target);
}

export function gpuVendor(gpus: string[] | undefined): string | null {
  const g = (gpus ?? []).join(" ").toLowerCase();
  if (g.includes("nvidia")) return "nvidia";
  if (g.includes("amd") || g.includes("radeon")) return "amd";
  if (g.includes("intel")) return "intel";
  return null;
}

export default function Optimize({ go }: { go: (p: PageId) => void }) {
  const toast = useToast();
  const tw = useTweaks();
  const { stats, info } = useStats();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ label: string; done: boolean; error?: string }[]>([]);
  const [makeRestore, setMakeRestore] = useState(true);
  const [section, setSection] = useState<"all" | "maint" | Category>("all");

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const [junk, startup, bloat, plans] = await Promise.all([api.scanJunk(), api.startupList(), api.listBloat(), api.powerPlans()]);
      setScan({ junk, startup, bloat, plans });
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    analyze();
  }, [analyze]);

  const vendor = gpuVendor(info?.gpus);
  const recommended = tw.list.filter((t) => t.recommended && (!t.vendor || t.vendor === vendor));
  const pendingTweaks = recommended.filter((t) => !tw.state[t.id]);
  const junkDefault = useMemo(() => scan?.junk.filter((j) => j.default) ?? [], [scan]);
  const junkSize = junkDefault.reduce((a, j) => a + j.size, 0);
  const startupOn = scan?.startup.filter((s) => s.enabled).length ?? 0;
  const bloatOn = useMemo(() => scan?.bloat.filter((b) => b.installed && !b.risk) ?? [], [scan]);
  const active = scan?.plans.find((p) => p.active);
  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : 0;
  const laptop = info?.laptop ?? false;
  const isPerf = !!active && (active.guid === POWER.high || /m[aá]ximo|ultimate|alto|high/i.test(active.name));

  const recs = useMemo<Rec[]>(() => {
    if (!scan) return [];
    return [
      {
        id: "junk",
        icon: <IconBroom size={17} />,
        title: junkSize > 50 * 1024 ** 2 ? `${bytes(junkSize)} de basura` : "Sin basura importante",
        detail: "Temporales, cachés de Windows Update, volcados y papelera.",
        points: Math.round(Math.min(20, Math.max(0, ((junkSize - 0.5 * GB) / (5 * GB)) * 20))),
        action:
          junkSize > 50 * 1024 ** 2
            ? {
                label: "Limpiar",
                auto: true,
                run: async () => toast(`Liberados ${bytes(await api.cleanJunk(junkDefault.map((j) => j.id)))}`),
              }
            : undefined,
      },
      {
        id: "startup",
        icon: <IconRocket size={17} />,
        title: `${startupOn} programas al iniciar`,
        detail: startupOn > 5 ? "Cada uno retrasa el arranque y gasta RAM." : "Un número razonable.",
        points: Math.min(15, Math.max(0, (startupOn - 5) * 2)),
        action: startupOn > 5 ? { label: "Revisar", auto: false, run: () => go("cleanup") } : undefined,
      },
      {
        id: "bloat",
        icon: <IconBox size={17} />,
        title: bloatOn.length ? `${bloatOn.length} apps innecesarias` : "Sin apps innecesarias",
        detail: bloatOn.length ? bloatOn.slice(0, 3).map((b) => b.name).join(", ") + (bloatOn.length > 3 ? "…" : "") : "Windows limpio.",
        points: Math.min(15, bloatOn.length),
        action: bloatOn.length ? { label: "Revisar", auto: false, run: () => go("debloat") } : undefined,
      },
      {
        id: "power",
        icon: <IconBolt size={17} />,
        title: `Plan: ${active?.name ?? "desconocido"}`,
        detail: laptop
          ? "En portátil, Equilibrado es lo más sensato fuera de las partidas."
          : isPerf
            ? "CPU a máxima frecuencia."
            : "Un plan de alto rendimiento evita bajadas de frecuencia.",
        points: laptop || isPerf ? 0 : 8,
        action: !laptop && !isPerf ? { label: "Activar", auto: true, run: ensurePerformancePlan } : undefined,
      },
      {
        id: "ram",
        icon: <IconMemory size={17} />,
        title: `RAM en uso: ${Math.round(ramPct)}%`,
        detail: ramPct > 75 ? "Liberar memoria puede reducir tirones." : "Memoria con margen de sobra.",
        points: ramPct > 75 ? Math.round(((ramPct - 75) / 25) * 7) : 0,
        action:
          ramPct > 75 ? { label: "Liberar", auto: true, run: async () => toast(`RAM liberada: ${bytes(await api.cleanRam())}`) } : undefined,
      },
    ];
  }, [scan, junkSize, junkDefault, startupOn, bloatOn, active, laptop, isPerf, ramPct, toast, go]);

  const tweakPts = recommended.length ? Math.round((35 * pendingTweaks.length) / recommended.length) : 0;
  const score = scan ? Math.max(0, 100 - tweakPts - recs.reduce((a, r) => a + r.points, 0)) : null;
  const verdict =
    score == null
      ? "Analizando…"
      : score >= 95
        ? "Totalmente optimizado"
        : score >= 75
          ? "Bien optimizado"
          : score >= 55
            ? "Mejorable"
            : "Necesita atención";
  const autoRecs = recs.filter((r) => r.points > 0 && r.action?.auto);
  const pendingCount = pendingTweaks.length + autoRecs.length;

  const runOne = async (r: Rec) => {
    if (!r.action) return;
    setRunning(r.id);
    try {
      await r.action.run();
      if (r.action.auto) await analyze();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    const plan: { label: string; fn: () => Promise<unknown> }[] = [];
    if (makeRestore) plan.push({ label: "Crear punto de restauración", fn: () => api.createRestorePoint() });
    if (pendingTweaks.length)
      plan.push({ label: `Aplicar ${pendingTweaks.length} tweaks recomendados`, fn: () => tw.set(pendingTweaks.map((t) => t.id), true) });
    for (const r of autoRecs) plan.push({ label: `${r.action!.label}: ${r.title}`, fn: async () => r.action!.run() });
    if (!plan.length) return;
    setSteps(plan.map((p) => ({ label: p.label, done: false })));
    setRunning("all");
    for (let i = 0; i < plan.length; i++) {
      try {
        await plan[i].fn();
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, done: true } : x)));
      } catch (e) {
        const msg = errMsg(e);
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, done: true, error: msg } : x)));
        if (i === 0 && makeRestore) {
          toast("No se pudo crear el punto de restauración; no se aplicó nada más. " + msg, "error");
          setRunning(null);
          return;
        }
      }
    }
    setRunning(null);
    toast("Optimización completada");
    analyze();
  };

  const sys = stats?.disks.find((d) => /^c:/i.test(d.mount)) ?? stats?.disks[0];
  const diskPct = sys && sys.total ? ((sys.total - sys.free) / sys.total) * 100 : 0;

  return (
    <>
      <PageHero
        icon={<IconSliders size={30} />}
        eyebrow="Optimización"
        title="Afina tu experiencia en Windows"
        subtitle="Aplica optimizaciones para mejorar el rendimiento, la respuesta y la estabilidad."
        art="sliders"
        side={
          <div className="hero-score">
            <Ring value={score} label="de 100" size={104} score />
            <div>
              <strong>Puntuación</strong>
              <span className={score != null && score >= 75 ? "tone-pink" : ""}>{verdict}</span>
              <small>
                <IconShield size={12} /> Privado · solo en este PC
              </small>
            </div>
          </div>
        }
      />

      <div className="opt">
        <div className="opt__main">
          <div className="chips">
            <button className={`chip ${section === "all" ? "is-active" : ""}`} onClick={() => setSection("all")}>
              <IconGrid size={14} /> Todo
            </button>
            <button className={`chip ${section === "maint" ? "is-active" : ""}`} onClick={() => setSection("maint")}>
              <IconBroom size={14} /> Mantenimiento <small>{recs.length}</small>
            </button>
            {SECTIONS.map((c) => {
              const n = recommended.filter((t) => t.category === c).length;
              return n ? (
                <button key={c} className={`chip ${section === c ? "is-active" : ""}`} onClick={() => setSection(c)}>
                  {CATEGORY_ICON[c](14)} {CATEGORY_LABEL[c]} <small>{n}</small>
                </button>
              ) : null;
            })}
            <button className="chip chip--ghost" onClick={analyze} disabled={loading}>
              <IconRefresh size={14} /> {loading ? "Analizando…" : "Volver a analizar"}
            </button>
          </div>

          {(section === "all" || section === "maint") && (
            <section className="tsection">
              <header className="tsection__head">
                <IconBroom size={17} />
                <h3>Mantenimiento</h3>
                <span className="count">{recs.length}</span>
                {recs.length > 0 && recs.every((r) => r.points === 0) && (
                  <span className="ok-label">
                    <IconCheck size={13} /> Todo en orden
                  </span>
                )}
              </header>
              <p className="tsection__sub">Estado general del equipo: basura, arranque, apps, energía y memoria.</p>
              <div className="rgrid">
                {!scan && Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
                {recs.map((r) => (
                  <div key={r.id} className={`rcard ${r.points === 0 ? "is-ok" : ""}`}>
                    <div className="rcard__top">
                      <span className="tcard__icon">{r.icon}</span>
                      <strong>{r.title}</strong>
                    </div>
                    <p>{r.detail}</p>
                    <div className="rcard__foot">
                      {r.points === 0 ? <Badge kind="ok">OK</Badge> : <Badge kind="warn">-{r.points} pts</Badge>}
                      {r.action && r.points > 0 && (
                        <Button small loading={running === r.id} disabled={!!running} onClick={() => runOne(r)}>
                          {r.action.label}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {SECTIONS.filter((c) => section === "all" || section === c).map((c) => {
            const items = recommended.filter((t) => t.category === c);
            if (!items.length) return null;
            const pend = items.filter((t) => !tw.state[t.id]);
            return (
              <section key={c} className="tsection">
                <header className="tsection__head">
                  {CATEGORY_ICON[c](17)}
                  <h3>{CATEGORY_LABEL[c]}</h3>
                  <span className="count">{items.length}</span>
                  {pend.length === 0 ? (
                    <span className="ok-label">
                      <IconCheck size={13} /> Recomendados aplicados
                    </span>
                  ) : (
                    <button className="see-all" disabled={!!running} onClick={() => tw.set(pend.map((t) => t.id), true)}>
                      Aplicar {pend.length} pendientes
                    </button>
                  )}
                </header>
                <div className="tgrid tgrid--3">
                  {items.map((t) => (
                    <TweakCard key={t.id} t={t} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="opt__side">
          <section className="panel">
            <header className="panel__head">
              <IconSparkle size={16} />
              <h3>Resumen del sistema</h3>
              <span className="live">En vivo</span>
            </header>
            <div className="overview">
              <div>
                <span>CPU</span>
                <b>{stats ? `${Math.round(stats.cpu)}%` : "—"}</b>
                <Bar value={stats?.cpu ?? 0} />
              </div>
              <div>
                <span>Memoria</span>
                <b>
                  <small>{stats ? `${bytes(stats.ram_used)} de ${bytes(stats.ram_total, 0)}` : ""}</small> {Math.round(ramPct)}%
                </b>
                <Bar value={ramPct} />
              </div>
              <div>
                <span>Disco {sys?.mount.replace("\\", "")}</span>
                <b>
                  <small>{sys ? `${bytes(sys.free)} libres` : ""}</small> {Math.round(diskPct)}%
                </b>
                <Bar value={diskPct} warn={85} danger={93} />
              </div>
              <div>
                <span>GPU</span>
                <b>{stats && stats.gpu >= 0 ? `${Math.round(stats.gpu)}%` : "—"}</b>
                <Bar value={stats && stats.gpu >= 0 ? stats.gpu : 0} />
              </div>
            </div>
            <p className="muted small">
              <IconShield size={12} /> Se lee en este PC. Nunca se envía a ningún sitio.
            </p>
          </section>

          <section className="panel recpanel">
            <header className="panel__head">
              <IconSparkle size={16} />
              <h3>Recomendado</h3>
            </header>
            {info && (
              <p className="muted small">
                Para tu PC: {bytes(info.ram_total, 0)} RAM · {info.laptop ? "Portátil" : "Sobremesa"}
                {vendor ? ` · ${vendor.toUpperCase()}` : ""}
              </p>
            )}
            {pendingCount === 0 && scan ? (
              <div className="recpanel__ok">
                <span>
                  <IconShield size={26} />
                </span>
                <strong>Está todo optimizado</strong>
                <small>Todo lo recomendado para este PC está aplicado.</small>
              </div>
            ) : (
              <ul className="recpanel__list">
                {pendingTweaks.length > 0 && <li>{pendingTweaks.length} tweaks recomendados sin aplicar</li>}
                {autoRecs.map((r) => (
                  <li key={r.id}>{r.title}</li>
                ))}
              </ul>
            )}
            {steps.length > 0 && (
              <ul className="steps">
                {steps.map((s) => (
                  <li key={s.label} className={s.error ? "is-error" : s.done ? "is-done" : ""} title={s.error}>
                    {s.done && !s.error ? <IconCheck size={14} /> : s.error ? "✕" : <span className="spinner spinner--sm" />}
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            <label className="check">
              <input type="checkbox" checked={makeRestore} onChange={(e) => setMakeRestore(e.target.checked)} />
              Crear antes un punto de restauración
            </label>
            <button className="cta-big" disabled={!scan || !!running || pendingCount === 0} onClick={runAll}>
              {running === "all" ? <span className="spinner" /> : <IconSparkle size={17} />}
              <span>Aplicar todo ({pendingCount})</span>
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
