import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PageHero } from "../components/Hero";
import {
  IconBolt,
  IconCpu,
  IconDisk,
  IconExternal,
  IconFps,
  IconGamepad,
  IconLeaf,
  IconMonitor,
  IconMoon,
  IconPlug,
  IconRefresh,
  IconRocket,
  IconScale,
  IconSliders,
  IconThermo,
  IconX,
} from "../components/Icons";
import { Button, Toggle } from "../components/ui";
import { api, errMsg, POWER, type PlanSetting, type PowerPlan, type PowerStatus } from "../lib/api";
import { useStats, useToast, useTweaks } from "../lib/store";

const BUILTIN = new Set<string>(Object.values(POWER));
const isUltimate = (p: PowerPlan) => /m[aá]ximo|ultimate/i.test(p.name);

function planMeta(p: PowerPlan): { icon: ReactNode; desc: string } {
  if (p.guid === POWER.balanced) return { icon: <IconScale size={20} />, desc: "Buen rendimiento y eficiencia para el día a día." };
  if (p.guid === POWER.saver) return { icon: <IconLeaf size={20} />, desc: "Máxima batería y menos consumo." };
  if (p.guid === POWER.high) return { icon: <IconGamepad size={20} />, desc: "Máximo rendimiento para juegos y tareas pesadas." };
  if (isUltimate(p)) return { icon: <IconRocket size={20} />, desc: "Quita las microlatencias de ahorro de energía." };
  return { icon: <IconSliders size={20} />, desc: "Plan personalizado." };
}

type Kind = "percent" | "minutes" | "enum";
const SETTINGS: { id: string; label: string; icon: ReactNode; kind: Kind; options?: [number, string][] }[] = [
  { id: "cpu_min", label: "CPU mínima", icon: <IconCpu size={17} />, kind: "percent" },
  { id: "cpu_max", label: "CPU máxima", icon: <IconCpu size={17} />, kind: "percent" },
  {
    id: "cpu_boost",
    label: "Turbo / Boost",
    icon: <IconFps size={17} />,
    kind: "enum",
    options: [
      [0, "Desactivado"],
      [1, "Activado"],
      [2, "Agresivo"],
      [3, "Eficiente"],
      [4, "Eficiente agresivo"],
    ],
  },
  { id: "disk_off", label: "Apagar disco", icon: <IconDisk size={17} />, kind: "minutes" },
  { id: "sleep", label: "Suspensión", icon: <IconMoon size={17} />, kind: "minutes" },
  { id: "display_off", label: "Apagar pantalla", icon: <IconMonitor size={17} />, kind: "minutes" },
  {
    id: "usb_suspend",
    label: "Suspensión USB",
    icon: <IconPlug size={17} />,
    kind: "enum",
    options: [
      [0, "Desactivada"],
      [1, "Activada"],
    ],
  },
  {
    id: "pcie_aspm",
    label: "Ahorro PCIe",
    icon: <IconSliders size={17} />,
    kind: "enum",
    options: [
      [0, "Desactivado"],
      [1, "Moderado"],
      [2, "Máximo"],
    ],
  },
];

function fmt(kind: Kind, v: number | null | undefined, options?: [number, string][]) {
  if (v == null) return "—";
  if (kind === "percent") return `${v}%`;
  if (kind === "minutes") return v === 0 ? "Nunca" : v < 60 ? `${v} s` : `${Math.round(v / 60)} min`;
  return options?.find(([k]) => k === v)?.[1] ?? String(v);
}

export default function Power() {
  const toast = useToast();
  const { stats, info } = useStats();
  const tw = useTweaks();
  const [plans, setPlans] = useState<PowerPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlanSetting[] | null>(null);
  const [activeSettings, setActiveSettings] = useState<PlanSetting[] | null>(null);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, { ac: number; dc: number }>>({});
  const [status, setStatus] = useState<PowerStatus | null>(null);

  const active = plans.find((p) => p.active);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.powerPlans();
      setPlans(p);
      setSelected((s) => s ?? p.find((x) => x.active)?.guid ?? p[0]?.guid ?? null);
      const a = p.find((x) => x.active);
      if (a) setActiveSettings(await api.powerSettings(a.guid));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .powerStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    tick();
    const t = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setSettings(null);
    setDraft({});
    setEdit(false);
    api
      .powerSettings(selected)
      .then(setSettings)
      .catch((e) => toast(errMsg(e), "error"));
  }, [selected, toast]);

  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try {
      await fn();
      toast(msg);
      await load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const sel = plans.find((p) => p.guid === selected);
  const hasUltimate = plans.some(isUltimate);
  const hasHigh = plans.some((p) => p.guid === POWER.high);

  const value = (id: string, side: "ac" | "dc") => {
    const d = draft[id];
    if (d) return d[side];
    return settings?.find((x) => x.id === id)?.[side] ?? null;
  };
  const editVal = (id: string, side: "ac" | "dc", v: number) => {
    const s = settings?.find((x) => x.id === id);
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { ac: s?.ac ?? 0, dc: s?.dc ?? 0 }), [side]: v } }));
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    try {
      for (const [id, v] of Object.entries(draft)) await api.powerSetSetting(selected, id, v.ac, v.dc);
      setSettings(await api.powerSettings(selected));
      if (selected === active?.guid) setActiveSettings(await api.powerSettings(selected));
      setDraft({});
      setEdit(false);
      toast("Ajustes del plan guardados");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const input = (s: (typeof SETTINGS)[number], side: "ac" | "dc") => {
    const v = value(s.id, side);
    if (v == null) return <span className="muted">—</span>;
    if (s.kind === "enum")
      return (
        <select value={v} onChange={(e) => editVal(s.id, side, Number(e.target.value))}>
          {s.options!.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      );
    if (s.kind === "percent")
      return (
        <div className="num">
          <input type="number" min={0} max={100} value={v} onChange={(e) => editVal(s.id, side, Math.max(0, Math.min(100, Number(e.target.value))))} />
          <span>%</span>
        </div>
      );
    return (
      <div className="num">
        <input type="number" min={0} value={Math.round(v / 60)} onChange={(e) => editVal(s.id, side, Math.max(0, Number(e.target.value)) * 60)} />
        <span>min</span>
      </div>
    );
  };

  // Ajustes adicionales (sobre el plan activo y los tweaks de hibernación / inicio rápido).
  const usb = activeSettings?.find((s) => s.id === "usb_suspend")?.ac;
  const aspm = activeSettings?.find((s) => s.id === "pcie_aspm")?.ac;
  const setActive = async (id: string, v: number, label: string) => {
    if (!active) return;
    setBusy(id);
    try {
      await api.powerSetSetting(active.guid, id, v, v);
      setActiveSettings(await api.powerSettings(active.guid));
      if (selected === active.guid) setSettings(await api.powerSettings(active.guid));
      toast(label);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const extras: { id: string; icon: ReactNode; title: string; sub: string; on: boolean | null; busy: boolean; change: (v: boolean) => void }[] = [
    {
      id: "hib",
      icon: <IconMoon size={16} />,
      title: "Hibernación",
      sub: "Guarda la sesión en disco al apagar (usa varios GB).",
      on: tw.list.length ? !tw.state["hibernation"] : null,
      busy: tw.busy.has("hibernation"),
      change: (v) => tw.set(["hibernation"], !v),
    },
    {
      id: "fast",
      icon: <IconBolt size={16} />,
      title: "Inicio rápido",
      sub: "Arranque más rápido, pero el apagado no es completo.",
      on: tw.list.length ? !tw.state["fast_startup"] : null,
      busy: tw.busy.has("fast_startup"),
      change: (v) => tw.set(["fast_startup"], !v),
    },
    {
      id: "usb_suspend",
      icon: <IconPlug size={16} />,
      title: "Suspensión selectiva USB",
      sub: "Ahorra energía, pero puede cortar ratones y mandos.",
      on: usb == null ? null : usb === 1,
      busy: busy === "usb_suspend",
      change: (v) => setActive("usb_suspend", v ? 1 : 0, v ? "Suspensión USB activada" : "Suspensión USB desactivada"),
    },
    {
      id: "pcie_aspm",
      icon: <IconSliders size={16} />,
      title: "Ahorro de energía PCIe",
      sub: "Baja el consumo de la gráfica y el SSD en reposo.",
      on: aspm == null ? null : aspm > 0,
      busy: busy === "pcie_aspm",
      change: (v) => setActive("pcie_aspm", v ? 2 : 0, v ? "Ahorro PCIe activado" : "Ahorro PCIe desactivado"),
    },
  ];

  return (
    <>
      <PageHero
        icon={<IconBolt size={30} />}
        title="Gestión de energía"
        subtitle="Elige o personaliza un plan para equilibrar rendimiento, eficiencia y batería."
        art="orbit"
        side={
          <div className="hero-tag">
            <strong>Energía más inteligente.</strong>
            <span>Para una mejor experiencia.</span>
          </div>
        }
      />

      <div className="pgrid">
        <section className="panel">
          <header className="panel__head panel__head--big">
            <span className="tcard__icon">
              <IconBolt size={17} />
            </span>
            <div>
              <h3>Planes de energía</h3>
              <small className="muted">Elige un plan o personaliza el tuyo.</small>
            </div>
            <div className="panel__actions">
              {!hasUltimate && (
                <Button small loading={busy === "add-ult"} onClick={() => run("add-ult", () => api.powerAdd("ultimate"), "Plan Máximo rendimiento añadido")}>
                  + Máximo rendimiento
                </Button>
              )}
              {!hasHigh && (
                <Button small loading={busy === "add-high"} onClick={() => run("add-high", () => api.powerAdd("high"), "Plan Alto rendimiento añadido")}>
                  + Alto rendimiento
                </Button>
              )}
              <Button small variant="ghost" icon={<IconRefresh size={15} />} loading={loading} onClick={load} title="Actualizar" />
            </div>
          </header>
          <div className="plan-cards">
            {plans.map((p) => {
              const m = planMeta(p);
              return (
                <div key={p.guid} className={`pcard ${selected === p.guid ? "is-sel" : ""} ${p.active ? "is-active" : ""}`} onClick={() => setSelected(p.guid)}>
                  <span className="pcard__icon">{m.icon}</span>
                  <strong>{p.name}</strong>
                  <p>{m.desc}</p>
                  <div className="pcard__foot" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`radio-btn ${p.active ? "is-on" : ""}`}
                      title={p.active ? "Plan activo" : "Activar este plan"}
                      disabled={p.active || busy === p.guid}
                      onClick={() => run(p.guid, () => api.powerSetActive(p.guid), `Plan "${p.name}" activado`)}
                    >
                      {busy === p.guid ? <span className="spinner spinner--sm" /> : <span />}
                    </button>
                    {!p.active && !BUILTIN.has(p.guid) && (
                      <button
                        className="icon-btn"
                        title="Eliminar plan"
                        disabled={busy === `del-${p.guid}`}
                        onClick={() => run(`del-${p.guid}`, () => api.powerDelete(p.guid), "Plan eliminado")}
                      >
                        <IconX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && !plans.length && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <h3>Estado de energía</h3>
            <span className="live">En vivo</span>
          </header>
          <div className="pstatus">
            <div>
              <IconCpu size={18} />
              <div>
                <strong>{stats ? (stats.freq_mhz / 1000).toFixed(2) : "—"} <small>GHz</small></strong>
                <span>Frecuencia de CPU</span>
              </div>
            </div>
            <div>
              <IconThermo size={18} />
              <div>
                <strong>{status?.temp != null ? Math.round(status.temp) : "—"} <small>°C</small></strong>
                <span>Temperatura (ACPI)</span>
              </div>
            </div>
            <div>
              <IconFps size={18} />
              <div>
                <strong>{stats ? Math.round(stats.cpu) : "—"} <small>%</small></strong>
                <span>Uso de CPU</span>
              </div>
            </div>
            <div>
              <IconPlug size={18} />
              <div>
                <strong>
                  {status ? (status.plugged ? "Enchufado" : "Batería") : "—"}
                  {status?.battery != null && <small> {status.battery}%</small>}
                </strong>
                <span>Fuente de energía</span>
              </div>
            </div>
          </div>
          <div className="pactive">
            <div>
              <small className="muted">Plan activo</small>
              <strong className="tone-pink">
                <IconBolt size={15} /> {active?.name ?? "—"}
              </strong>
              {info?.laptop && <small className="muted">Portátil: los planes de alto rendimiento gastan más batería.</small>}
            </div>
            <Button small icon={<IconExternal size={14} />} onClick={() => api.openPowerSettings().catch((e) => toast(errMsg(e), "error"))}>
              Opciones de Windows
            </Button>
          </div>
        </section>

        <section className="panel">
          <header className="panel__head panel__head--big">
            <span className="tcard__icon">
              <IconSliders size={17} />
            </span>
            <div>
              <h3>Detalles del plan</h3>
              <small className="muted">Qué ajusta este plan y cómo afecta al equipo.</small>
            </div>
            <div className="panel__actions">
              {edit ? (
                <>
                  <Button
                    small
                    variant="ghost"
                    onClick={() => {
                      setDraft({});
                      setEdit(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button small variant="primary" loading={busy === "save"} disabled={!Object.keys(draft).length} onClick={save}>
                    Guardar ({Object.keys(draft).length})
                  </Button>
                </>
              ) : (
                <Button small disabled={!settings} onClick={() => setEdit(true)}>
                  Personalizar
                </Button>
              )}
            </div>
          </header>
          {sel && (
            <div className="pdetails">
              <div className="pdetails__name">
                <span className="tone-pink">{planMeta(sel).icon}</span>
                <div>
                  <strong>{sel.name}</strong>
                  <small className="muted">{planMeta(sel).desc}</small>
                </div>
                <small className="muted">Valores enchufado</small>
              </div>
              <div className="ptiles">
                {SETTINGS.map((s) => {
                  const cur = settings?.find((x) => x.id === s.id);
                  return (
                    <div key={s.id} className={`ptile ${draft[s.id] ? "is-changed" : ""}`}>
                      <span className="ptile__icon">{s.icon}</span>
                      <div>
                        <small>{s.label}</small>
                        {!settings ? (
                          <b>…</b>
                        ) : edit ? (
                          <div className="ptile__edit">
                            {input(s, "ac")}
                            {input(s, "dc")}
                          </div>
                        ) : (
                          <>
                            <b>{fmt(s.kind, cur?.ac, s.options)}</b>
                            {cur?.dc != null && cur.dc !== cur.ac && <small className="muted">Batería: {fmt(s.kind, cur.dc, s.options)}</small>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <header className="panel__head">
            <h3>Ajustes adicionales</h3>
          </header>
          <div className="extras">
            {extras.map((x) => (
              <div key={x.id} className="extra">
                <span className="tcard__icon">{x.icon}</span>
                <div>
                  <strong>{x.title}</strong>
                  <small>{x.sub}</small>
                </div>
                {x.on == null ? <span className="muted">—</span> : <Toggle on={x.on} busy={x.busy} onChange={x.change} />}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
