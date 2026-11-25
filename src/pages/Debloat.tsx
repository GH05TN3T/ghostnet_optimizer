import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHero, Perks } from "../components/Hero";
import { IconBolt, IconBox, IconRefresh, IconShield, IconTrash, IconX } from "../components/Icons";
import { Badge, Button, Card, Confirm } from "../components/ui";
import { api, errMsg, type BloatApp } from "../lib/api";
import { useToast } from "../lib/store";

export default function Debloat() {
  const toast = useToast();
  const [apps, setApps] = useState<BloatApp[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApps(await api.listBloat());
      setSel(new Set());
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = showAll ? apps : apps.filter((a) => a.installed);
  const groups = useMemo(() => {
    const g: Record<string, BloatApp[]> = {};
    for (const a of visible) (g[a.category] ??= []).push(a);
    return g;
  }, [visible]);

  const installed = apps.filter((a) => a.installed);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectSafe = () => setSel(new Set(installed.filter((a) => !a.risk).map((a) => a.id)));

  const remove = async () => {
    setRemoving(true);
    const ids = [...sel];
    try {
      await api.removeBloat(ids);
      toast(`${ids.length} apps eliminadas`);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setRemoving(false);
      load();
    }
  };

  const selectedApps = apps.filter((a) => sel.has(a.id));

  return (
    <>
      <PageHero
        icon={<IconTrash size={30} />}
        title="Debloat"
        subtitle={loading ? "Buscando apps preinstaladas…" : `${installed.length} apps preinstaladas encontradas en este equipo.`}
        art="tiles"
        side={
          <Perks
            items={[
              { icon: <IconBox size={16} />, title: "Menos apps", sub: "Fuera lo que no usas" },
              { icon: <IconBolt size={16} />, title: "Menos procesos", sub: "Más RAM libre" },
              { icon: <IconShield size={16} />, title: "Reversible", sub: "Reinstala desde la Store" },
            ]}
          />
        }
      />

      <div className="toolbar toolbar--end">
            <Button icon={<IconRefresh />} loading={loading} onClick={load}>
              Actualizar
            </Button>
            <Button onClick={selectSafe} disabled={loading}>
              Seleccionar seguras
            </Button>
            <Button variant="danger" icon={<IconX />} disabled={!sel.size} loading={removing} onClick={() => setConfirm(true)}>
              Eliminar ({sel.size})
            </Button>
        <label className="check" style={{ marginRight: "auto", order: -1 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Mostrar también las que no están instaladas
        </label>
      </div>

      {loading && !apps.length && <div className="skeleton" style={{ height: 300 }} />}

      <div className="bloat-groups">
        {Object.entries(groups).map(([cat, list]) => (
          <Card key={cat} title={cat}>
            <div className="bloat-grid">
              {list.map((a) => (
                <label key={a.id} className={`bloat ${!a.installed ? "is-missing" : ""} ${sel.has(a.id) ? "is-sel" : ""}`}>
                  <input type="checkbox" disabled={!a.installed} checked={sel.has(a.id)} onChange={() => toggle(a.id)} />
                  <div>
                    <strong>
                      {a.name} {!a.installed && <Badge>No instalada</Badge>}
                    </strong>
                    <p>{a.desc}</p>
                    {a.risk && (
                      <p className="bloat__risk">
                        <Badge kind="warn">Ojo</Badge> {a.risk}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Confirm
        open={confirm}
        title={`Eliminar ${sel.size} apps`}
        danger
        confirmText="Eliminar"
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      >
        <p>Se desinstalarán para todos los usuarios y no se volverán a instalar en cuentas nuevas:</p>
        <p className="muted">{selectedApps.map((a) => a.name).join(", ")}</p>
        <p>Si luego echas de menos alguna, puedes reinstalarla desde Microsoft Store.</p>
      </Confirm>
    </>
  );
}
