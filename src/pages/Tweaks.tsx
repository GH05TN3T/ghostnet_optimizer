import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconSearch } from "../components/Icons";
import { TweakList } from "../components/TweakList";
import { Button, Confirm, Empty, PageHeader } from "../components/ui";
import { api, errMsg, type Category } from "../lib/api";
import { CATEGORY_LABEL } from "../lib/format";
import { useToast, useTweaks } from "../lib/store";

const CATS: (Category | "all")[] = ["all", "privacidad", "interfaz", "sistema", "rendimiento", "seguridad"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export default function Tweaks({ focus }: { focus?: string }) {
  const { list, state, loading, refresh, set } = useTweaks();
  const toast = useToast();
  const [cat, setCat] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const [confirmRisk, setConfirmRisk] = useState(false);
  const [explorer, setExplorer] = useState(false);
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    if (!focus) return;
    const t = list.find((x) => x.id === focus);
    if (t) setCat(t.category);
    setTimeout(() => document.getElementById(`tweak-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [focus, list]);

  const items = useMemo(() => {
    const n = norm(q.trim());
    return list.filter(
      (t) => (cat === "all" || t.category === cat) && (!n || norm(t.name).includes(n) || norm(t.desc).includes(n)),
    );
  }, [list, cat, q]);

  const counts = useMemo(() => {
    const c: Record<string, [number, number]> = {};
    for (const t of list) {
      for (const k of ["all", t.category]) {
        c[k] ??= [0, 0];
        c[k][1]++;
        if (state[t.id]) c[k][0]++;
      }
    }
    return c;
  }, [list, state]);

  const pendingRec = list.filter((t) => t.recommended && !state[t.id]);

  const applyRecommended = async () => {
    setBulk(true);
    const ok = await set(pendingRec.map((t) => t.id), true);
    setBulk(false);
    if (ok) toast(`${pendingRec.length} ajustes aplicados`);
  };

  const restartExplorer = async () => {
    setExplorer(true);
    try {
      await api.restartExplorer();
      toast("Explorador reiniciado");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setExplorer(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Tweaks"
        subtitle={`${list.length} ajustes. Cada interruptor se puede revertir en cualquier momento.`}
        actions={
          <>
            <Button icon={<IconRefresh />} loading={explorer} onClick={restartExplorer} title="Aplica cambios de barra de tareas y menú contextual">
              Reiniciar Explorador
            </Button>
            <Button variant="primary" loading={bulk} disabled={!pendingRec.length} onClick={applyRecommended}>
              Aplicar recomendados ({pendingRec.length})
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="tabs">
          {CATS.map((c) => (
            <button
              key={c}
              className={`tab ${cat === c ? "is-active" : ""} ${c === "seguridad" ? "tab--danger" : ""}`}
              onClick={() => (c === "seguridad" && cat !== "seguridad" ? setConfirmRisk(true) : setCat(c))}
            >
              {c === "all" ? "Todos" : CATEGORY_LABEL[c]}
              {counts[c] && (
                <small>
                  {counts[c][0]}/{counts[c][1]}
                </small>
              )}
            </button>
          ))}
        </div>
        <div className="search">
          <IconSearch size={16} />
          <input placeholder="Filtrar ajustes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="ghost" small icon={<IconRefresh size={15} />} loading={loading} onClick={refresh} title="Releer el estado real del sistema" />
      </div>

      {cat === "seguridad" && (
        <div className="banner banner--danger">
          Estos cambios reducen la seguridad de Windows. Úsalos solo si sabes por qué los necesitas, y crea antes un punto de
          restauración.
        </div>
      )}

      {loading && !list.length ? (
        <div className="tweak-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : items.length ? (
        <TweakList items={items} highlight={focus} />
      ) : (
        <Empty>No hay ajustes que coincidan.</Empty>
      )}

      <Confirm
        open={confirmRisk}
        title="Ajustes de seguridad"
        danger
        confirmText="Ver de todos modos"
        onConfirm={() => setCat("seguridad")}
        onClose={() => setConfirmRisk(false)}
      >
        Esta sección incluye desactivar Defender, SmartScreen, avisos de UAC, actualizaciones automáticas e Integridad de
        memoria. Pueden dejar el equipo expuesto a malware. ¿Quieres verlos?
      </Confirm>
    </>
  );
}
