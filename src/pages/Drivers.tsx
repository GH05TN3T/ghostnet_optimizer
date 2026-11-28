import { useCallback, useEffect, useState } from "react";
import { PageHero } from "../components/Hero";
import { IconAlert, IconCheck, IconChip, IconDownload, IconExternal, IconRefresh, IconSettings } from "../components/Icons";
import { Badge, Button, Card, Empty } from "../components/ui";
import { api, errMsg, type DriversStatus } from "../lib/api";
import { driversStore, useDrivers, vendorLink } from "../lib/drivers";
import { useToast } from "../lib/store";

export default function Drivers() {
  const toast = useToast();
  const [st, setSt] = useState<DriversStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [wmicBusy, setWmicBusy] = useState(false);
  const run = useDrivers();
  const working = run.status === "searching" || run.status === "working";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSt(await api.driversStatus());
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Al terminar una instalación de drivers, refrescamos la lista de dispositivos.
  useEffect(() => {
    if (run.status === "done") {
      if (run.installed > 0) toast(`${run.installed} driver(s) instalados${run.reboot ? ". Reinicia para terminar." : "."}`, "ok");
      else if (run.found === 0) toast("Windows Update no encontró drivers nuevos: ya están al día.", "ok");
      load();
    }
    if (run.status === "error") toast(run.error ?? "Error al buscar drivers.", "error");
  }, [run.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startUpdate = async () => {
    driversStore.begin();
    try {
      await api.driversUpdate();
    } catch (e) {
      toast(errMsg(e), "error");
      driversStore.reset();
    }
  };

  const installWmic = async () => {
    setWmicBusy(true);
    try {
      await api.wmicInstall();
      toast("WMIC instalado correctamente.", "ok");
      load();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setWmicBusy(false);
    }
  };

  const vendor = st ? vendorLink(st.manufacturer, st.model) : null;
  const wmic = st?.wmic;

  return (
    <div className="page-drivers">
      <PageHero
        icon={<IconChip size={30} />}
        eyebrow="Controladores"
        title="Drivers y WMIC"
        subtitle="Baja los controladores que le faltan a la laptop desde Windows Update, abre la página del fabricante e instala WMIC en equipos recién formateados."
        art="tiles"
      />

      {/* --- Equipo detectado --- */}
      <Card>
        <div className="drv-head">
          <div>
            <h3>{loading ? "Detectando equipo…" : `${st?.manufacturer || "Equipo"} ${st?.model || ""}`.trim()}</h3>
            {st && (
              <p className="muted small">
                {st.os}
                {st.bios ? ` · BIOS ${st.bios}` : ""}
                {st.sku ? ` · SKU ${st.sku}` : ""}
              </p>
            )}
          </div>
          <div className="drv-head__actions">
            <Button variant="ghost" onClick={load} disabled={loading}>
              <IconRefresh size={16} /> Actualizar
            </Button>
            {vendor && (
              <Button variant="ghost" onClick={() => api.openUrl(vendor.url).catch((e) => toast(errMsg(e), "error"))}>
                <IconExternal size={16} /> Drivers de {vendor.name}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* --- Bajar drivers de Windows Update --- */}
      <Card>
        <div className="drv-row">
          <div className="drv-row__text">
            <h4>
              <IconDownload size={17} /> Bajar drivers (Windows Update)
            </h4>
            <p className="muted small">
              Busca en Windows Update los controladores que le faltan a este equipo y los instala. Necesita internet. Puede tardar varios
              minutos y quizá pida reiniciar.
            </p>
          </div>
          <Button onClick={startUpdate} disabled={working}>
            {working ? "Buscando…" : "Buscar e instalar"}
          </Button>
        </div>

        {run.status !== "idle" && (
          <div className="drv-progress">
            {run.status === "searching" && <p className="muted small">Buscando drivers en Windows Update…</p>}
            {run.status === "working" && run.current && (
              <>
                <div className="drv-progress__bar">
                  <span style={{ width: `${run.found ? (run.index / run.found) * 100 : 20}%` }} />
                </div>
                <p className="muted small">
                  {run.index}/{run.found} · {run.phase === "download" ? "Descargando" : run.phase === "install" ? "Instalando" : ""} {run.current}
                </p>
              </>
            )}
            {run.log.length > 0 && (
              <ul className="drv-log">
                {run.log.map((l, i) => (
                  <li key={i} className={l.ok ? "ok" : "bad"}>
                    {l.ok ? <IconCheck size={14} /> : <IconAlert size={14} />} {l.title || "Driver"}
                  </li>
                ))}
              </ul>
            )}
            {run.status === "done" && (
              <p className="small">
                {run.installed > 0 ? (
                  <>
                    Listo: {run.installed} instalados.{run.reboot && " Reinicia para terminar."}
                  </>
                ) : (
                  "Windows Update no encontró drivers nuevos."
                )}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* --- Dispositivos sin driver --- */}
      <Card>
        <div className="drv-head">
          <h4>Dispositivos con problemas</h4>
          <Button variant="ghost" onClick={() => api.openDeviceManager().catch((e) => toast(errMsg(e), "error"))}>
            <IconSettings size={16} /> Administrador de dispositivos
          </Button>
        </div>
        {loading ? (
          <p className="muted small">Revisando dispositivos…</p>
        ) : !st?.missing.length ? (
          <Empty>Todos los dispositivos tienen su driver. 👍</Empty>
        ) : (
          <ul className="drv-devices">
            {st.missing.map((d) => (
              <li key={d.instance_id}>
                <div>
                  <strong>{d.name || "Dispositivo desconocido"}</strong>
                  <span className="muted small">
                    {d.class || "Sin categoría"}
                    {d.problem === 28 ? " · sin controlador" : d.status ? ` · ${d.status}` : ""}
                  </span>
                </div>
                <Badge kind="warn">{d.problem === 28 ? "Falta driver" : d.status || "Problema"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- WMIC --- */}
      <Card>
        <div className="drv-row">
          <div className="drv-row__text">
            <h4>
              WMIC{" "}
              {wmic === "present" ? (
                <Badge kind="ok">Instalado</Badge>
              ) : wmic === "absent" ? (
                <Badge kind="warn">No instalado</Badge>
              ) : null}
            </h4>
            <p className="muted small">
              Windows 11 ya no trae WMIC de serie, así que una laptop recién formateada se queda sin él y algunos programas y scripts fallan.
              Este botón lo instala desde Windows Update.
            </p>
          </div>
          {wmic === "present" ? (
            <Button variant="ghost" disabled>
              <IconCheck size={16} /> Ya instalado
            </Button>
          ) : (
            <Button onClick={installWmic} disabled={wmicBusy || wmic === "unknown"}>
              {wmicBusy ? "Instalando…" : "Instalar WMIC"}
            </Button>
          )}
        </div>
        {wmic === "unknown" && !loading && (
          <p className="muted small">Esta versión de Windows no ofrece WMIC como función opcional (o no se pudo comprobar).</p>
        )}
      </Card>
    </div>
  );
}
