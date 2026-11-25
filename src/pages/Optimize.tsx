import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PageId } from "../App";
import { Ring } from "../components/Charts";
import { IconCheck, IconRefresh, IconRocket } from "../components/Icons";
import { Button, Card, PageHeader } from "../components/ui";
import { api, errMsg, POWER, type BloatApp, type JunkCategory, type PowerPlan, type StartupItem } from "../lib/api";
import { bytes } from "../lib/format";
import { useStats, useToast, useTweaks } from "../lib/store";

interface Scan {
  junk: JunkCategory[];
  startup: StartupItem[];
  bloat: BloatApp[];
  plans: PowerPlan[];
}

interface Rec {
  id: string;
  title: string;
  detail: string;
  points: number; // puntos que se pierden
  max: number;
  action?: { label: string; run: () => Promise<void> | void };
}

const GB = 1024 ** 3;

export default function Optimize({ go }: { go: (p: PageId) => void }) {
  const toast = useToast();
  const tw = useTweaks();
  const { stats, info } = useStats();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ label: string; done: boolean; error?: string }[]>([]);
  const [makeRestore, setMakeRestore] = useState(true);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const [junk, startup, bloat, plans] = await Promise.all([
        api.scanJunk(),
        api.startupList(),
        api.listBloat(),
        api.powerPlans(),
      ]);
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

  const recTweaks = tw.list.filter((t) => t.recommended && !tw.state[t.id]);
  const recCount = tw.list.filter((t) => t.recommended).length;
  const junkDefault = scan?.junk.filter((j) => j.default) ?? [];
  const junkSize = junkDefault.reduce((a, j) => a + j.size, 0);
  const startupOn = scan?.startup.filter((s) => s.enabled).length ?? 0;
  const bloatOn = scan?.bloat.filter((b) => b.installed && !b.risk).length ?? 0;
  const active = scan?.plans.find((p) => p.active);
  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : 0;
  const laptop = info?.laptop ?? false;

  const ensurePerformancePlan = useCallback(async () => {
    const plans = await api.powerPlans();
    // Busca un plan de Máximo rendimiento ya creado (nombre localizado) o lo crea.
    let target = plans.find((p) => /m[aá]ximo|ultimate/i.test(p.name))?.guid;
    if (!target) {
      try {
        target = await api.powerAdd("ultimate");
      } catch {
        target = plans.find((p) => p.guid === POWER.high)?.guid ?? (await api.powerAdd("high"));
      }
    }
    await api.powerSetActive(target);
  }, []);

  const recs = useMemo<Rec[]>(() => {
    if (!scan) return [];
    const list: Rec[] = [];
    const missing = recCount ? recTweaks.length / recCount : 0;
    list.push({
      id: "tweaks",
      title: recTweaks.length ? `${recTweaks.length} ajustes recomendados sin aplicar` : "Ajustes recomendados aplicados",
      detail: recTweaks.length
        ? recTweaks.slice(0, 4).map((t) => t.name).join(", ") + (recTweaks.length > 4 ? "…" : "")
        : "Privacidad, interfaz y rendimiento en orden.",
      points: Math.round(35 * missing),
      max: 35,
      action: recTweaks.length
        ? { label: "Aplicar", run: async () => void (await tw.set(recTweaks.map((t) => t.id), true)) }
        : undefined,
    });
    const junkPts = Math.round(Math.min(20, Math.max(0, ((junkSize - 0.5 * GB) / (5 * GB)) * 20)));
    list.push({
      id: "junk",
      title: junkSize > 50 * 1024 ** 2 ? `${bytes(junkSize)} de archivos basura` : "Sin archivos basura importantes",
      detail: junkDefault.filter((j) => j.size > 0).map((j) => `${j.name} (${bytes(j.size)})`).slice(0, 3).join(", ") || "Temporales y cachés limpios.",
      points: junkPts,
      max: 20,
      action:
        junkSize > 50 * 1024 ** 2
          ? {
              label: "Limpiar",
              run: async () => {
                const freed = await api.cleanJunk(junkDefault.map((j) => j.id));
                toast(`Liberados ${bytes(freed)}`);
              },
            }
          : undefined,
    });
    const startPts = Math.min(15, Math.max(0, (startupOn - 5) * 2));
    list.push({
      id: "startup",
      title: `${startupOn} programas se abren al iniciar Windows`,
      detail: startupOn > 5 ? "Cada uno retrasa el arranque y consume RAM en segundo plano." : "Un número razonable.",
      points: startPts,
      max: 15,
      action: startupOn > 5 ? { label: "Revisar", run: () => go("cleanup") } : undefined,
    });
    list.push({
      id: "bloat",
      title: bloatOn ? `${bloatOn} apps preinstaladas innecesarias` : "Sin apps preinstaladas innecesarias",
      detail: bloatOn
        ? scan.bloat.filter((b) => b.installed && !b.risk).slice(0, 5).map((b) => b.name).join(", ") + (bloatOn > 5 ? "…" : "")
        : "Windows limpio.",
      points: Math.min(15, bloatOn),
      max: 15,
      action: bloatOn ? { label: "Revisar", run: () => go("debloat") } : undefined,
    });
    const isPerf = !!active && (active.guid === POWER.high || /m[aá]ximo|ultimate|alto|high/i.test(active.name));
    list.push({
      id: "power",
      title: `Plan de energía: ${active?.name ?? "desconocido"}`,
      detail: laptop
        ? "En portátil el plan Equilibrado es lo más sensato fuera de las partidas."
        : isPerf
          ? "El procesador puede trabajar a máxima frecuencia."
          : "Un plan de alto rendimiento evita que la CPU baje de frecuencia en juegos.",
      points: laptop || isPerf ? 0 : 8,
      max: 8,
      action: !laptop && !isPerf ? { label: "Máximo rendimiento", run: ensurePerformancePlan } : undefined,
    });
    list.push({
      id: "ram",
      title: `RAM en uso: ${Math.round(ramPct)}%`,
      detail: ramPct > 75 ? "Liberar memoria puede reducir tirones si vas a jugar." : "Memoria con margen de sobra.",
      points: ramPct > 75 ? Math.round(((ramPct - 75) / 25) * 7) : 0,
      max: 7,
      action: ramPct > 75 ? { label: "Liberar RAM", run: async () => void toast(`RAM liberada: ${bytes(await api.cleanRam())}`) } : undefined,
    });
    return list;
  }, [scan, recTweaks, recCount, junkSize, junkDefault, startupOn, bloatOn, active, laptop, ramPct, tw, toast, go, ensurePerformancePlan]);

  const score = scan ? Math.max(0, 100 - recs.reduce((a, r) => a + r.points, 0)) : null;
  const verdict = score == null ? "" : score >= 90 ? "Excelente" : score >= 75 ? "Bien" : score >= 55 ? "Mejorable" : "Necesita atención";

  const runOne = async (r: Rec) => {
    if (!r.action) return;
    setRunning(r.id);
    try {
      await r.action.run();
      await analyze();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRunning(null);
    }
  };

  const runAll = async () => {
    const plan: { label: string; fn: () => Promise<unknown> }[] = [];
    if (makeRestore) plan.push({ label: "Crear punto de restauración", fn: () => api.createRestorePoint() });
    if (recTweaks.length) plan.push({ label: `Aplicar ${recTweaks.length} ajustes recomendados`, fn: () => tw.set(recTweaks.map((t) => t.id), true) });
    if (junkDefault.length) plan.push({ label: "Limpiar archivos basura", fn: () => api.cleanJunk(junkDefault.map((j) => j.id)) });
    const pr = recs.find((r) => r.id === "power");
    if (pr?.action) plan.push({ label: "Activar plan de Máximo rendimiento", fn: ensurePerformancePlan });
    plan.push({ label: "Liberar RAM", fn: () => api.cleanRam() });

    setSteps(plan.map((p) => ({ label: p.label, done: false })));
    setRunning("all");
    for (let i = 0; i < plan.length; i++) {
      try {
        await plan[i].fn();
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, done: true } : x)));
      } catch (e) {
        const msg = errMsg(e);
        setSteps((s) => s.map((x, j) => (j === i ? { ...x, done: true, error: msg } : x)));
        // Si el punto de restauración falla, no seguimos sin red de seguridad.
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

  return (
    <>
      <PageHeader
        title="Optimización"
        subtitle="Analiza el equipo y aplica las recomendaciones de una vez o una por una."
        actions={
          <Button icon={<IconRefresh />} loading={loading} onClick={analyze}>
            Volver a analizar
          </Button>
        }
      />

      <div className="optimize">
        <Card className="score-card">
          <Ring value={score} label="Puntuación" size={190} score />
          <h2>{loading && !scan ? "Analizando…" : verdict}</h2>
          <label className="check">
            <input type="checkbox" checked={makeRestore} onChange={(e) => setMakeRestore(e.target.checked)} />
            Crear punto de restauración antes
          </label>
          <Button variant="primary" icon={<IconRocket />} loading={running === "all"} disabled={!scan || !!running} onClick={runAll}>
            Optimizar todo
          </Button>
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
        </Card>

        <div className="recs">
          {!scan &&
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 74 }} />)}
          {recs.map((r) => (
            <RecRow key={r.id} r={r} busy={running === r.id} disabled={!!running} onRun={() => runOne(r)} />
          ))}
        </div>
      </div>
    </>
  );
}

function RecRow({ r, busy, disabled, onRun }: { r: Rec; busy: boolean; disabled: boolean; onRun: () => void }): ReactNode {
  const ok = r.points === 0;
  return (
    <div className={`rec ${ok ? "is-ok" : ""}`}>
      <div className="rec__icon">{ok ? <IconCheck size={16} /> : `-${r.points}`}</div>
      <div className="rec__text">
        <strong>{r.title}</strong>
        <p>{r.detail}</p>
      </div>
      {r.action && (
        <Button small loading={busy} disabled={disabled} onClick={onRun}>
          {r.action.label}
        </Button>
      )}
    </div>
  );
}
