import { useCallback, useEffect, useState } from "react";
import { IconBolt, IconCheck, IconRefresh, IconX } from "../components/Icons";
import { Badge, Button, Card, Empty, PageHeader } from "../components/ui";
import { api, errMsg, POWER, type PlanSetting, type PowerPlan } from "../lib/api";
import { useStats, useToast } from "../lib/store";

const BUILTIN = new Set<string>(Object.values(POWER));

function describe(p: PowerPlan): string {
  const n = p.name.toLowerCase();
  if (p.guid === POWER.balanced) return "Sube y baja la frecuencia según la carga. El de por defecto.";
  if (p.guid === POWER.saver) return "Limita la CPU y el brillo para ahorrar batería.";
  if (p.guid === POWER.high) return "La CPU se mantiene en frecuencias altas. Más consumo y temperatura.";
  if (/m[aá]ximo|ultimate/.test(n)) return "Elimina microlatencias de ahorro de energía. Ideal para jugar en PC de sobremesa.";
  return "Plan personalizado.";
}

type Kind = "percent" | "minutes" | "enum";
const SETTINGS: { id: string; label: string; kind: Kind; options?: [number, string][] }[] = [
  { id: "cpu_min", label: "Estado mínimo del procesador", kind: "percent" },
  { id: "cpu_max", label: "Estado máximo del procesador", kind: "percent" },
  {
    id: "cpu_boost",
    label: "Modo Turbo / Boost",
    kind: "enum",
    options: [
      [0, "Desactivado"],
      [1, "Activado"],
      [2, "Agresivo"],
      [3, "Eficiente"],
      [4, "Eficiente agresivo"],
    ],
  },
  { id: "display_off", label: "Apagar pantalla tras", kind: "minutes" },
  { id: "sleep", label: "Suspender tras", kind: "minutes" },
  { id: "disk_off", label: "Apagar disco duro tras", kind: "minutes" },
  {
    id: "usb_suspend",
    label: "Suspensión selectiva de USB",
    kind: "enum",
    options: [
      [0, "Desactivada"],
      [1, "Activada"],
    ],
  },
  {
    id: "pcie_aspm",
    label: "Ahorro de energía PCI Express",
    kind: "enum",
    options: [
      [0, "Desactivado"],
      [1, "Moderado"],
      [2, "Máximo"],
    ],
  },
];

function fmt(kind: Kind, v: number | null, options?: [number, string][]) {
  if (v == null) return "—";
  if (kind === "percent") return `${v}%`;
  if (kind === "minutes") return v === 0 ? "Nunca" : `${Math.round(v / 60)} min`;
  return options?.find(([k]) => k === v)?.[1] ?? String(v);
}

export default function Power() {
  const toast = useToast();
  const { info } = useStats();
  const [plans, setPlans] = useState<PowerPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlanSetting[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { ac: number; dc: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.powerPlans();
      setPlans(p);
      setSelected((s) => s ?? p.find((x) => x.active)?.guid ?? p[0]?.guid ?? null);
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
    if (!selected) return;
    setSettings(null);
    setDraft({});
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

  const hasUltimate = plans.some((p) => /m[aá]ximo|ultimate/i.test(p.name));
  const hasHigh = plans.some((p) => p.guid === POWER.high);
  const sel = plans.find((p) => p.guid === selected);

  const value = (id: string, side: "ac" | "dc") => {
    const d = draft[id];
    if (d) return d[side];
    const s = settings?.find((x) => x.id === id);
    return s?.[side] ?? null;
  };

  const edit = (id: string, side: "ac" | "dc", v: number) => {
    const s = settings?.find((x) => x.id === id);
    setDraft((d) => {
      const cur = d[id] ?? { ac: s?.ac ?? 0, dc: s?.dc ?? 0 };
      return { ...d, [id]: { ...cur, [side]: v } };
    });
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    try {
      for (const [id, v] of Object.entries(draft)) {
        await api.powerSetSetting(selected, id, v.ac, v.dc);
      }
      setSettings(await api.powerSettings(selected));
      setDraft({});
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
        <select value={v} onChange={(e) => edit(s.id, side, Number(e.target.value))}>
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
          <input type="number" min={0} max={100} value={v} onChange={(e) => edit(s.id, side, Math.max(0, Math.min(100, Number(e.target.value))))} />
          <span>%</span>
        </div>
      );
    return (
      <div className="num">
        <input type="number" min={0} value={Math.round(v / 60)} onChange={(e) => edit(s.id, side, Math.max(0, Number(e.target.value)) * 60)} />
        <span>min</span>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Energía"
        subtitle="Elige el plan de energía, revisa sus ajustes y modifícalos antes de aplicarlos."
        actions={
          <>
            <Button icon={<IconRefresh />} loading={loading} onClick={load}>
              Actualizar
            </Button>
            {!hasHigh && (
              <Button loading={busy === "add-high"} onClick={() => run("add-high", () => api.powerAdd("high"), "Plan Alto rendimiento añadido")}>
                Añadir Alto rendimiento
              </Button>
            )}
            {!hasUltimate && (
              <Button variant="primary" icon={<IconBolt />} loading={busy === "add-ult"} onClick={() => run("add-ult", () => api.powerAdd("ultimate"), "Plan Máximo rendimiento añadido")}>
                Añadir Máximo rendimiento
              </Button>
            )}
          </>
        }
      />

      {info?.laptop && (
        <div className="banner">Es un portátil: los planes de alto rendimiento gastan bastante más batería y calientan más.</div>
      )}

      <div className="plans">
        {plans.map((p) => (
          <div key={p.guid} className={`plan ${p.active ? "is-active" : ""} ${selected === p.guid ? "is-sel" : ""}`} onClick={() => setSelected(p.guid)}>
            <div className="plan__head">
              <strong>{p.name}</strong>
              {p.active && <Badge kind="ok">Activo</Badge>}
            </div>
            <p>{describe(p)}</p>
            <div className="plan__actions" onClick={(e) => e.stopPropagation()}>
              {!p.active && (
                <Button small icon={<IconCheck size={14} />} loading={busy === p.guid} onClick={() => run(p.guid, () => api.powerSetActive(p.guid), `Plan "${p.name}" activado`)}>
                  Activar
                </Button>
              )}
              {!p.active && !BUILTIN.has(p.guid) && (
                <Button small variant="ghost" icon={<IconX size={14} />} loading={busy === `del-${p.guid}`} onClick={() => run(`del-${p.guid}`, () => api.powerDelete(p.guid), "Plan eliminado")} title="Eliminar plan" />
              )}
            </div>
          </div>
        ))}
        {!loading && !plans.length && <Empty>No se pudieron leer los planes de energía.</Empty>}
      </div>

      {sel && (
        <Card
          title={`Ajustes de "${sel.name}"`}
          actions={
            Object.keys(draft).length > 0 && (
              <>
                <Button small variant="ghost" onClick={() => setDraft({})}>
                  Descartar
                </Button>
                <Button small variant="primary" loading={busy === "save"} onClick={save}>
                  Guardar cambios ({Object.keys(draft).length})
                </Button>
              </>
            )
          }
        >
          {!settings ? (
            <div className="skeleton" style={{ height: 240 }} />
          ) : (
            <table className="settings">
              <thead>
                <tr>
                  <th>Ajuste</th>
                  <th>Enchufado</th>
                  <th>Batería</th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS.map((s) => {
                  const changed = !!draft[s.id];
                  const orig = settings.find((x) => x.id === s.id);
                  return (
                    <tr key={s.id} className={changed ? "is-changed" : ""}>
                      <td>
                        {s.label}
                        {changed && orig && (
                          <small className="muted">
                            {" "}
                            antes: {fmt(s.kind, orig.ac, s.options)} / {fmt(s.kind, orig.dc, s.options)}
                          </small>
                        )}
                      </td>
                      <td>{input(s, "ac")}</td>
                      <td>{input(s, "dc")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
