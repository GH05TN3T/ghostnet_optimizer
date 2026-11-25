import { useCallback, useEffect, useState } from "react";
import { IconBroom, IconRefresh } from "../components/Icons";
import { Badge, Button, Card, Confirm, Empty, PageHeader, Toggle } from "../components/ui";
import { api, errMsg, type JunkCategory, type StartupItem } from "../lib/api";
import { bytes } from "../lib/format";
import { useToast } from "../lib/store";

const SOURCE: Record<string, string> = {
  HKCU: "Registro (usuario)",
  HKLM: "Registro (equipo)",
  HKLM32: "Registro (32 bits)",
  UserFolder: "Carpeta Inicio",
  CommonFolder: "Carpeta Inicio (todos)",
};

export default function Cleanup() {
  const toast = useToast();
  const [junk, setJunk] = useState<JunkCategory[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const [startup, setStartup] = useState<StartupItem[]>([]);
  const [stBusy, setStBusy] = useState<string | null>(null);

  const [compact, setCompact] = useState<string>("");
  const [compactBusy, setCompactBusy] = useState(false);
  const [compactConfirm, setCompactConfirm] = useState<null | boolean>(null);
  const [dismBusy, setDismBusy] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const j = await api.scanJunk();
      setJunk(j);
      setSel((s) => (s.size ? s : new Set(j.filter((x) => x.default).map((x) => x.id))));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setScanning(false);
    }
  }, [toast]);

  const loadStartup = useCallback(async () => {
    try {
      setStartup(await api.startupList());
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }, [toast]);

  useEffect(() => {
    scan();
    loadStartup();
    api.compactQuery().then(setCompact).catch(() => {});
  }, [scan, loadStartup]);

  const total = junk.filter((j) => sel.has(j.id)).reduce((a, j) => a + j.size, 0);

  const clean = async () => {
    setCleaning(true);
    try {
      const freed = await api.cleanJunk([...sel]);
      toast(`Liberados ${bytes(freed)}. Los archivos en uso se han saltado.`);
      await scan();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setCleaning(false);
    }
  };

  const toggleStartup = async (it: StartupItem, v: boolean) => {
    setStBusy(it.id);
    try {
      await api.startupSet(it.id, v);
      setStartup((l) => l.map((x) => (x.id === it.id ? { ...x, enabled: v } : x)));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setStBusy(null);
    }
  };

  const runCompact = async (enable: boolean) => {
    setCompactBusy(true);
    toast("Comprimiendo Windows… puede tardar entre 5 y 20 minutos. No apagues el equipo.", "info");
    try {
      await api.compactSet(enable);
      setCompact(await api.compactQuery());
      toast(enable ? "Windows comprimido" : "Compresión desactivada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setCompactBusy(false);
    }
  };

  const runDism = async () => {
    setDismBusy(true);
    toast("Limpiando componentes de Windows con DISM… tarda varios minutos.", "info");
    try {
      await api.componentCleanup();
      toast("Limpieza de componentes terminada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setDismBusy(false);
    }
  };

  const enabledCount = startup.filter((s) => s.enabled).length;

  return (
    <>
      <PageHeader
        title="Limpieza"
        subtitle="Archivos basura, programas de inicio y compresión del sistema."
        actions={
          <>
            <Button icon={<IconRefresh />} loading={scanning} onClick={scan}>
              Analizar
            </Button>
            <Button variant="primary" icon={<IconBroom />} loading={cleaning} disabled={!sel.size || scanning} onClick={clean}>
              Limpiar {total ? bytes(total) : ""}
            </Button>
          </>
        }
      />

      <Card title="Archivos basura">
        <div className="junk">
          {junk.map((j) => (
            <label key={j.id} className={`junk__row ${sel.has(j.id) ? "is-sel" : ""}`}>
              <input
                type="checkbox"
                checked={sel.has(j.id)}
                onChange={() =>
                  setSel((s) => {
                    const n = new Set(s);
                    n.has(j.id) ? n.delete(j.id) : n.add(j.id);
                    return n;
                  })
                }
              />
              <div>
                <strong>{j.name}</strong>
                <p>{j.desc}</p>
              </div>
              <span className="junk__size">
                {scanning ? <span className="spinner spinner--sm" /> : bytes(j.size)}
                <small>{j.files.toLocaleString("es")} archivos</small>
              </span>
            </label>
          ))}
          {scanning && !junk.length && <div className="skeleton" style={{ height: 300 }} />}
        </div>
      </Card>

      <Card
        title={`Programas de inicio · ${enabledCount} activos`}
        actions={<Button small variant="ghost" icon={<IconRefresh size={15} />} onClick={loadStartup} />}
      >
        {startup.length ? (
          <div className="startup">
            {startup.map((s) => (
              <div key={s.id} className="startup__row">
                <div>
                  <strong>{s.name}</strong> <Badge>{SOURCE[s.source] ?? s.source}</Badge>
                  <p title={s.command}>{s.command}</p>
                </div>
                <Toggle on={s.enabled} busy={stBusy === s.id} onChange={(v) => toggleStartup(s, v)} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No hay programas configurados para iniciarse con Windows.</Empty>
        )}
        <p className="muted small">
          Desactivar aquí es lo mismo que hacerlo desde el Administrador de tareas: no borra nada y se puede volver a activar.
        </p>
      </Card>

      <div className="grid-2">
        <Card title="Comprimir Windows (CompactOS)">
          <p className="muted">
            Comprime los archivos del sistema sin borrar nada. Suele liberar 2–6 GB con un impacto mínimo en rendimiento en SSD.
            Útil en discos pequeños.
          </p>
          {compact && <pre className="out">{compact.trim()}</pre>}
          <div className="quick">
            <Button loading={compactBusy} onClick={() => setCompactConfirm(true)}>
              Comprimir
            </Button>
            <Button variant="ghost" disabled={compactBusy} onClick={() => setCompactConfirm(false)}>
              Descomprimir
            </Button>
          </div>
        </Card>
        <Card title="Limpieza de componentes (WinSxS)">
          <p className="muted">
            Usa DISM para borrar versiones antiguas de componentes que dejaron las actualizaciones. Seguro, pero tarda varios
            minutos y no se pueden desinstalar las actualizaciones ya aplicadas.
          </p>
          <div className="quick">
            <Button loading={dismBusy} onClick={runDism}>
              Limpiar componentes
            </Button>
          </div>
        </Card>
      </div>

      <Confirm
        open={compactConfirm !== null}
        title={compactConfirm ? "Comprimir Windows" : "Descomprimir Windows"}
        confirmText={compactConfirm ? "Comprimir" : "Descomprimir"}
        onConfirm={() => runCompact(!!compactConfirm)}
        onClose={() => setCompactConfirm(null)}
      >
        El proceso tarda entre 5 y 20 minutos y usa bastante disco y CPU mientras dura. Puedes seguir usando la app, pero no apagues
        el equipo hasta que termine.
      </Confirm>
    </>
  );
}
