import { useEffect, useMemo, useState } from "react";
import { Perks, PageHero } from "../components/Hero";
import { IconBolt, IconChevron, IconGrid, IconMonitor, IconRefresh, IconRestore, IconSearch, IconShield, IconWrench } from "../components/Icons";
import { CATEGORY_ICON, TweakCard } from "../components/TweakCard";
import { Button, Confirm, Empty } from "../components/ui";
import { api, errMsg, type Category } from "../lib/api";
import { CATEGORY_LABEL } from "../lib/format";
import { useToast, useTweaks } from "../lib/store";

const CATS: Category[] = ["privacidad", "interfaz", "sistema", "rendimiento", "gpu", "seguridad"];
const PREVIEW = 8;

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmRisk, setConfirmRisk] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [explorer, setExplorer] = useState(false);
  const [bulk, setBulk] = useState<string | null>(null);

  useEffect(() => {
    if (!focus) return;
    const t = list.find((x) => x.id === focus);
    if (!t) return;
    setCat(t.category);
    setQ(t.name);
  }, [focus, list]);

  const n = norm(q.trim());
  const filtered = useMemo(
    () => list.filter((t) => (cat === "all" || t.category === cat) && (!n || norm(t.name).includes(n) || norm(t.desc).includes(n))),
    [list, cat, n],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    for (const t of list) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [list]);

  const applied = list.filter((t) => state[t.id]);
  const pendingRec = list.filter((t) => t.recommended && !state[t.id]);

  const run = async (key: string, ids: string[], enable: boolean, msg: string) => {
    setBulk(key);
    const ok = await set(ids, enable);
    setBulk(null);
    if (ok) toast(msg);
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

  const pickCat = (c: Category | "all") => {
    if (c === "seguridad" && cat !== "seguridad") setConfirmRisk(true);
    else setCat(c);
  };

  const sections = CATS.map((c) => ({ c, items: filtered.filter((t) => t.category === c) })).filter((s) => s.items.length);
  const showAll = cat !== "all" || !!n;

  return (
    <>
      <PageHero
        icon={<IconWrench size={30} />}
        title="Tweaks"
        subtitle="Ajusta Windows a tu gusto. Cambios simples, grandes mejoras."
        art="toggles"
        side={
          <Perks
            items={[
              { icon: <IconBolt size={16} />, title: "Mejor rendimiento", sub: "Más fluido" },
              { icon: <IconShield size={16} />, title: "Más privacidad", sub: "Tú tienes el control" },
              { icon: <IconMonitor size={16} />, title: "Sistema más limpio", sub: "Menos distracciones" },
            ]}
          />
        }
      />

      <div className="toolbar">
        <div className="search search--big">
          <IconSearch size={17} />
          <input placeholder="Buscar tweaks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button icon={<IconRefresh size={16} />} loading={explorer} onClick={restartExplorer} title="Aplica cambios de barra de tareas y menú contextual">
          Reiniciar Explorador
        </Button>
        <Button icon={<IconRestore size={16} />} disabled={!applied.length} onClick={() => setConfirmReset(true)}>
          Revertir todo
        </Button>
        <Button
          variant="primary"
          loading={bulk === "rec"}
          disabled={!pendingRec.length}
          onClick={() => run("rec", pendingRec.map((t) => t.id), true, `${pendingRec.length} ajustes aplicados`)}
        >
          Aplicar recomendados ({pendingRec.length})
        </Button>
      </div>

      <div className="chips">
        <button className={`chip ${cat === "all" ? "is-active" : ""}`} onClick={() => pickCat("all")}>
          <IconGrid size={14} /> Todos <small>{counts.all}</small>
        </button>
        {CATS.map((c) => (
          <button key={c} className={`chip ${cat === c ? "is-active" : ""} ${c === "seguridad" ? "chip--danger" : ""}`} onClick={() => pickCat(c)}>
            {CATEGORY_ICON[c](14)} {CATEGORY_LABEL[c]} <small>{counts[c] ?? 0}</small>
          </button>
        ))}
        <button className="chip chip--ghost" onClick={refresh} title="Releer el estado real del sistema">
          <IconRefresh size={14} /> {loading ? "Leyendo…" : "Actualizar estado"}
        </button>
      </div>

      {cat === "seguridad" && (
        <div className="banner banner--danger">
          Estos cambios reducen la seguridad de Windows. Úsalos solo si sabes por qué los necesitas, y crea antes un punto de restauración.
        </div>
      )}

      {loading && !list.length && (
        <div className="tgrid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 150 }} />
          ))}
        </div>
      )}

      {sections.map(({ c, items }) => {
        const open = showAll || expanded.has(c);
        const on = items.filter((t) => state[t.id]).length;
        return (
          <section key={c} className="tsection">
            <header className="tsection__head">
              {CATEGORY_ICON[c](17)}
              <h3>{CATEGORY_LABEL[c]}</h3>
              <span className="count">{items.length} tweaks</span>
              <span className="muted small">{on} activos</span>
              {!showAll && items.length > PREVIEW && (
                <button
                  className="see-all"
                  onClick={() =>
                    setExpanded((s) => {
                      const x = new Set(s);
                      x.has(c) ? x.delete(c) : x.add(c);
                      return x;
                    })
                  }
                >
                  {open ? "Ver menos" : `Ver todo (${items.length})`} <IconChevron size={13} />
                </button>
              )}
            </header>
            <div className="tgrid">
              {(open ? items : items.slice(0, PREVIEW)).map((t) => (
                <TweakCard key={t.id} t={t} />
              ))}
            </div>
          </section>
        );
      })}

      {!loading && list.length > 0 && !sections.length && <Empty>No hay tweaks que coincidan.</Empty>}

      <Confirm
        open={confirmRisk}
        title="Ajustes de seguridad"
        danger
        confirmText="Ver de todos modos"
        onConfirm={() => setCat("seguridad")}
        onClose={() => setConfirmRisk(false)}
      >
        Esta sección incluye desactivar Defender, SmartScreen, avisos de UAC, actualizaciones automáticas e Integridad de memoria. Pueden
        dejar el equipo expuesto a malware. ¿Quieres verlos?
      </Confirm>

      <Confirm
        open={confirmReset}
        title={`Revertir ${applied.length} tweaks`}
        danger
        confirmText="Revertir todo"
        onConfirm={() => run("reset", applied.map((t) => t.id), false, "Todos los tweaks revertidos")}
        onClose={() => setConfirmReset(false)}
      >
        Se devolverán a su valor original de Windows todos los ajustes que ahora están activos, incluidos los que Windows trae así de
        fábrica (por ejemplo el Modo juego).
      </Confirm>
    </>
  );
}
