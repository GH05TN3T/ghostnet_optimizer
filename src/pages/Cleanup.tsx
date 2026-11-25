import { useCallback, useEffect, useState } from "react";
import { PageHero, Perks } from "../components/Hero";
import { IconBroom, IconLeaf, IconRefresh, IconRocket, IconShield } from "../components/Icons";
import { Badge, Button, Card, Empty, Toggle } from "../components/ui";
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

  const enabledCount = startup.filter((s) => s.enabled).length;

  return (
    <>
      <PageHero
        icon={<IconBroom size={30} />}
        title="Limpieza"
        subtitle="Borra archivos basura y decide qué se abre al iniciar Windows."
        art="nebula"
        side={
          <Perks
            items={[
              { icon: <IconLeaf size={16} />, title: "Más espacio", sub: "Temporales y cachés" },
              { icon: <IconRocket size={16} />, title: "Arranque rápido", sub: "Menos programas al iniciar" },
              { icon: <IconShield size={16} />, title: "Seguro", sub: "Salta archivos en uso" },
            ]}
          />
        }
      />

      <div className="toolbar toolbar--end">
        <Button icon={<IconRefresh />} loading={scanning} onClick={scan}>
          Analizar
        </Button>
        <Button variant="primary" icon={<IconBroom />} loading={cleaning} disabled={!sel.size || scanning} onClick={clean}>
          Limpiar {total ? bytes(total) : ""}
        </Button>
      </div>

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

    </>
  );
}
