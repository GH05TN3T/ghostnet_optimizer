import { useState } from "react";
import type { PageId } from "../App";
import { Area, Ring } from "../components/Charts";
import { IconBroom, IconGauge, IconRestore, IconRocket } from "../components/Icons";
import { Bar, Button, Card, PageHeader } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { bytes, rate, uptime } from "../lib/format";
import { useStats, useToast } from "../lib/store";

export default function Home({ go }: { go: (p: PageId) => void }) {
  const { stats, history, info } = useStats();
  const toast = useToast();
  const [ram, setRam] = useState(false);
  const [rp, setRp] = useState(false);

  const ramPct = stats && stats.ram_total ? (stats.ram_used / stats.ram_total) * 100 : null;

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

  const restore = async () => {
    setRp(true);
    try {
      await api.createRestorePoint();
      toast("Punto de restauración creado");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRp(false);
    }
  };

  return (
    <>
      <PageHeader
        title={info ? `Hola, ${info.user}` : "Inicio"}
        subtitle={info ? `${info.os} ${info.version} · compilación ${info.build}` : "Cargando información del sistema…"}
        actions={
          <>
            <Button icon={<IconRestore />} loading={rp} onClick={restore}>
              Punto de restauración
            </Button>
            <Button variant="primary" icon={<IconGauge />} onClick={() => go("optimize")}>
              Analizar PC
            </Button>
          </>
        }
      />

      <div className="rings">
        <Card>
          <Ring value={stats?.cpu ?? null} label="CPU" sub={stats ? `${(stats.freq_mhz / 1000).toFixed(2)} GHz` : undefined} />
        </Card>
        <Card>
          <Ring value={ramPct} label="RAM" sub={stats ? `${bytes(stats.ram_used)} / ${bytes(stats.ram_total)}` : undefined} />
        </Card>
        <Card>
          <Ring value={stats && stats.gpu >= 0 ? stats.gpu : null} label="GPU" sub={stats && stats.gpu < 0 ? "No disponible" : "Motor 3D"} />
        </Card>
        <Card>
          <div className="mini-stats">
            <div>
              <small>Disco</small>
              <strong>{stats ? rate(stats.disk_read + stats.disk_write) : "—"}</strong>
            </div>
            <div>
              <small>Procesos</small>
              <strong>{stats?.processes ?? "—"}</strong>
            </div>
            <div>
              <small>Encendido</small>
              <strong>{stats ? uptime(stats.uptime) : "—"}</strong>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="CPU y RAM" actions={<span className="legend"><i className="lg-a" />CPU <i className="lg-b" />RAM</span>}>
          <Area a={history.cpu} b={history.ram} max={100} height={120} />
        </Card>
        <Card
          title="Red"
          actions={
            <span className="legend">
              <i className="lg-a" />↓ {stats ? rate(stats.net_down) : "—"} <i className="lg-b" />↑ {stats ? rate(stats.net_up) : "—"}
            </span>
          }
        >
          <Area a={history.down} b={history.up} height={120} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Equipo">
          {info ? (
            <dl className="specs">
              <dt>Procesador</dt>
              <dd>
                {info.cpu} <small>({info.cores} núcleos / {info.threads} hilos)</small>
              </dd>
              <dt>Gráfica</dt>
              <dd>{info.gpus.join(" · ") || "—"}</dd>
              <dt>Memoria</dt>
              <dd>
                {bytes(info.ram_total, 0)}
                {info.ram_speed ? ` @ ${info.ram_speed} MT/s` : ""}
              </dd>
              <dt>Placa base</dt>
              <dd>{info.board || "—"}</dd>
              <dt>Almacenamiento</dt>
              <dd>
                {info.drives.length ? info.drives.map((d) => <div key={d}>{d}</div>) : "—"}
              </dd>
              <dt>Equipo</dt>
              <dd>
                {info.host} {info.laptop && <small>(portátil)</small>}
              </dd>
            </dl>
          ) : (
            <div className="skeleton" style={{ height: 180 }} />
          )}
        </Card>

        <Card title="Unidades">
          <div className="disks">
            {stats?.disks.map((d) => {
              const used = d.total - d.free;
              const p = d.total ? (used / d.total) * 100 : 0;
              return (
                <div key={d.mount} className="disk">
                  <div className="disk__head">
                    <strong>{d.mount}</strong>
                    <span>{d.name}</span>
                    <small>
                      {bytes(d.free)} libres de {bytes(d.total)}
                    </small>
                  </div>
                  <Bar value={p} warn={80} danger={92} />
                </div>
              );
            })}
          </div>
          <div className="quick">
            <Button icon={<IconRocket />} loading={ram} onClick={freeRam}>
              Liberar RAM
            </Button>
            <Button icon={<IconBroom />} onClick={() => go("cleanup")}>
              Limpiar archivos
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
