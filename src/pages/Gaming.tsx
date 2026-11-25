import { useState } from "react";
import { Area, Ring } from "../components/Charts";
import { IconRocket, IconX } from "../components/Icons";
import { TweakList } from "../components/TweakList";
import { Bar, Button, Card, PageHeader } from "../components/ui";
import { api, errMsg, POWER } from "../lib/api";
import { bytes, rate } from "../lib/format";
import { useStats, useToast, useTweaks } from "../lib/store";

const BOOST_KEY = "optimizador.boost.prevPlan";

function getPrev(): string | null {
  try {
    return localStorage.getItem(BOOST_KEY);
  } catch {
    return null;
  }
}
function setPrev(v: string | null) {
  try {
    if (v) localStorage.setItem(BOOST_KEY, v);
    else localStorage.removeItem(BOOST_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export default function Gaming() {
  const { stats, history } = useStats();
  const { list } = useTweaks();
  const toast = useToast();
  const [boosting, setBoosting] = useState(false);
  const [boosted, setBoosted] = useState(() => !!getPrev());
  const [killing, setKilling] = useState<string | null>(null);

  const gamingTweaks = list.filter((t) => t.category === "rendimiento");
  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : null;

  const boost = async () => {
    setBoosting(true);
    try {
      const plans = await api.powerPlans();
      const current = plans.find((p) => p.active);
      let target = plans.find((p) => /m[aá]ximo|ultimate/i.test(p.name))?.guid;
      if (!target) {
        try {
          target = await api.powerAdd("ultimate");
        } catch {
          target = plans.find((p) => p.guid === POWER.high)?.guid ?? (await api.powerAdd("high"));
        }
      }
      if (current && current.guid !== target) setPrev(current.guid);
      await api.powerSetActive(target);
      const freed = await api.cleanRam();
      setBoosted(true);
      toast(`Modo juego activado · Máximo rendimiento · ${bytes(Math.max(0, freed))} de RAM liberada`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBoosting(false);
    }
  };

  const unboost = async () => {
    setBoosting(true);
    try {
      await api.powerSetActive(getPrev() ?? POWER.balanced);
      setPrev(null);
      setBoosted(false);
      toast("Plan de energía restaurado");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBoosting(false);
    }
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
      <PageHeader
        title="Gaming"
        subtitle="Medidores en vivo y ajustes para más FPS, menos latencia y más estabilidad."
        actions={
          boosted ? (
            <Button icon={<IconX />} loading={boosting} onClick={unboost}>
              Salir del modo juego
            </Button>
          ) : (
            <Button variant="primary" icon={<IconRocket />} loading={boosting} onClick={boost}>
              Modo juego
            </Button>
          )
        }
      />

      <div className="rings">
        <Card>
          <Ring value={stats?.cpu ?? null} label="CPU" />
        </Card>
        <Card>
          <Ring value={stats && stats.gpu >= 0 ? stats.gpu : null} label="GPU" />
        </Card>
        <Card>
          <Ring value={ramPct} label="RAM" sub={stats ? bytes(stats.ram_used) : undefined} />
        </Card>
        <Card>
          <div className="mini-stats">
            <div>
              <small>Lectura disco</small>
              <strong>{stats ? rate(stats.disk_read) : "—"}</strong>
            </div>
            <div>
              <small>Escritura disco</small>
              <strong>{stats ? rate(stats.disk_write) : "—"}</strong>
            </div>
            <div>
              <small>Red ↓ / ↑</small>
              <strong>
                {stats ? `${rate(stats.net_down)} / ${rate(stats.net_up)}` : "—"}
              </strong>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="CPU y GPU (60 s)" actions={<span className="legend"><i className="lg-a" />CPU <i className="lg-b" />GPU</span>}>
          <Area a={history.cpu} b={history.gpu} max={100} height={110} />
        </Card>
        <Card title={`Núcleos (${stats?.cores.length ?? 0})`}>
          <div className="cores">
            {stats?.cores.map((c, i) => (
              <div key={i} className="core" title={`Núcleo ${i}: ${Math.round(c)}%`}>
                <div className="core__fill" style={{ height: `${Math.min(100, c)}%` }} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid-2 grid-2--wide-left">
        <Card title="Ajustes para juegos">
          <TweakList items={gamingTweaks} />
        </Card>
        <Card title="Lo que más RAM usa">
          <table className="procs">
            <thead>
              <tr>
                <th>Proceso</th>
                <th>CPU</th>
                <th>RAM</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stats?.top.map((p) => (
                <tr key={p.pid}>
                  <td title={p.name}>{p.name.replace(/\.exe$/i, "")}</td>
                  <td>{p.cpu.toFixed(1)}%</td>
                  <td>
                    {bytes(p.mem)}
                    <Bar value={stats.ram_total ? (p.mem / stats.ram_total) * 100 * 4 : 0} />
                  </td>
                  <td>
                    <button className="icon-btn" title="Cerrar proceso" disabled={killing === p.name} onClick={() => kill(p.name)}>
                      <IconX size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
