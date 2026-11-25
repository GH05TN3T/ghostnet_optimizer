import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHero } from "../components/Hero";
import { IconBolt, IconDownload, IconGrid, IconRefresh, IconSearch, IconShield, IconSparkle, IconTrash } from "../components/Icons";
import { Button, Confirm, Empty } from "../components/ui";
import { api, errMsg, type AppItem } from "../lib/api";
import { useToast } from "../lib/store";
import { iconUrls } from "../lib/appIcons";

type Sort = "popular" | "az" | "installed";

function Avatar({ app, size = 38 }: { app: AppItem; size?: number }) {
  const urls = iconUrls(app.id);
  const [i, setI] = useState(0);
  if (i < urls.length) {
    return (
      <span className="app-icon" style={{ width: size, height: size }}>
        <img src={urls[i]} alt="" loading="lazy" draggable={false} onError={() => setI((x) => x + 1)} />
      </span>
    );
  }
  // Sin Internet o sin icono: iniciales con el color de la app.
  const letters = app.name.replace(/[^A-Za-z0-9+]/g, "").slice(0, 2);
  return (
    <span className="app-avatar" style={{ width: size, height: size, background: app.color, fontSize: size * 0.36 }}>
      {letters}
    </span>
  );
}

export default function Apps() {
  const toast = useToast();
  const [apps, setApps] = useState<AppItem[]>([]);
  const [winget, setWinget] = useState(true);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<Sort>("popular");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [queued, setQueued] = useState<string[]>([]);
  const [uninstall, setUninstall] = useState<AppItem | null>(null);
  const queue = useRef(Promise.resolve());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.appsList();
      setWinget(r.winget);
      setApps(r.apps);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // winget no admite bien instalaciones en paralelo: se hacen de una en una.
  const enqueue = (app: AppItem, install: boolean) => {
    setQueued((qs) => [...qs, app.id]);
    queue.current = queue.current.then(async () => {
      setQueued((qs) => qs.filter((x) => x !== app.id));
      setBusy((b) => new Set(b).add(app.id));
      try {
        if (install) await api.appInstall(app.id);
        else await api.appUninstall(app.id);
        setApps((l) => l.map((a) => (a.id === app.id ? { ...a, installed: install } : a)));
        toast(install ? `${app.name} instalado` : `${app.name} desinstalado`);
      } catch (e) {
        toast(`${app.name}: ${errMsg(e)}`, "error");
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(app.id);
          return n;
        });
      }
    });
  };

  const cats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of apps) c[a.category] = (c[a.category] ?? 0) + 1;
    return Object.entries(c);
  }, [apps]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const l = apps.filter(
      (a) => (cat === "all" || a.category === cat) && (!n || a.name.toLowerCase().includes(n) || a.desc.toLowerCase().includes(n) || a.id.toLowerCase().includes(n)),
    );
    const byName = (x: AppItem, y: AppItem) => x.name.localeCompare(y.name, "es");
    if (sort === "az") return [...l].sort(byName);
    if (sort === "installed") return [...l].sort((x, y) => Number(y.installed) - Number(x.installed) || byName(x, y));
    return [...l].sort((x, y) => (x.popular || 99) - (y.popular || 99) || byName(x, y));
  }, [apps, q, cat, sort]);

  const popular = apps.filter((a) => a.popular > 0).sort((x, y) => x.popular - y.popular).slice(0, 6);
  const state = (a: AppItem) => (busy.has(a.id) ? "busy" : queued.includes(a.id) ? "queued" : a.installed ? "installed" : "none");

  const action = (a: AppItem, big = false) => {
    const s = state(a);
    if (s === "busy" || s === "queued")
      return (
        <button className={big ? "app-btn is-busy" : "app-icon-btn"} disabled>
          <span className="spinner spinner--sm" />
          {big && (s === "busy" ? "Trabajando…" : "En cola")}
        </button>
      );
    if (s === "installed")
      return (
        <button className={big ? "app-btn app-btn--ghost" : "app-icon-btn"} title="Desinstalar" disabled={!winget} onClick={() => setUninstall(a)}>
          <IconTrash size={big ? 15 : 14} />
          {big && "Desinstalar"}
        </button>
      );
    return (
      <button className={big ? "app-btn" : "app-icon-btn app-icon-btn--pink"} title="Instalar" disabled={!winget} onClick={() => enqueue(a, true)}>
        <IconDownload size={big ? 15 : 14} />
        {big && "Instalar"}
      </button>
    );
  };

  return (
    <>
      <PageHero
        eyebrow="Apps"
        title="Monta un PC mejor"
        subtitle="Instala apps, herramientas y runtimes de confianza: rápido, seguro y siempre al día."
        art="tiles"
        side={
          <div className="hero-script">
            Herramientas
            <br />
            para hacer más.
          </div>
        }
      >
        <div className="inline-perks">
          <span>
            <IconShield size={15} />
            <b>Fuentes oficiales</b>
            <small>winget de Microsoft</small>
          </span>
          <span>
            <IconRefresh size={15} />
            <b>Siempre al día</b>
            <small>Última versión</small>
          </span>
          <span>
            <IconBolt size={15} />
            <b>Un clic</b>
            <small>Sin asistentes</small>
          </span>
          <span>
            <IconSparkle size={15} />
            <b>Sin basura</b>
            <small>Sin barras ni extras</small>
          </span>
        </div>
      </PageHero>

      {!winget && (
        <div className="banner banner--warn">
          winget no está instalado. Instala "Instalador de aplicación" (App Installer) desde Microsoft Store y pulsa Actualizar.
        </div>
      )}

      <div className="toolbar">
        <div className="search search--big">
          <IconSearch size={17} />
          <input placeholder="Buscar apps…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select-big" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="popular">Más populares</option>
          <option value="az">A–Z</option>
          <option value="installed">Instaladas primero</option>
        </select>
        <Button icon={<IconRefresh size={16} />} loading={loading} onClick={load} title="Volver a leer qué está instalado" />
      </div>

      <div className="chips">
        <button className={`chip ${cat === "all" ? "is-active" : ""}`} onClick={() => setCat("all")}>
          <IconGrid size={14} /> Todas <small>{apps.length}</small>
        </button>
        {cats.map(([c, n]) => (
          <button key={c} className={`chip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>
            {c} <small>{n}</small>
          </button>
        ))}
      </div>

      {cat === "all" && !q && popular.length > 0 && (
        <section className="tsection">
          <header className="tsection__head">
            <h3>Apps populares</h3>
            <span className="muted small">Lo esencial, listo cuando lo necesites.</span>
          </header>
          <div className="app-cards">
            {popular.map((a) => (
              <div key={a.id} className={`app-card ${a.installed ? "is-installed" : ""}`}>
                <Avatar app={a} size={40} />
                <strong>{a.name}</strong>
                <p>{a.desc}</p>
                <small className={a.installed ? "tone-green" : "muted"}>{a.installed ? "Instalada" : a.category}</small>
                {action(a, true)}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="tsection">
        <header className="tsection__head">
          <h3>
            {cat === "all" ? "Todas las apps" : cat} <span className="muted">({filtered.length})</span>
          </h3>
          <span className="muted small">{apps.filter((a) => a.installed).length} instaladas</span>
        </header>
        {loading && !apps.length ? (
          <div className="app-rows">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 56 }} />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="app-rows">
            {filtered.map((a) => (
              <div key={a.id} className="app-row" title={a.id}>
                <Avatar app={a} size={32} />
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.category}
                    {a.installed && <span className="tone-green"> · Instalada</span>}
                  </small>
                </div>
                <span className="app-row__desc">{a.desc}</span>
                {action(a)}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No hay apps que coincidan.</Empty>
        )}
      </section>

      <Confirm
        open={!!uninstall}
        title={`Desinstalar ${uninstall?.name}`}
        danger
        confirmText="Desinstalar"
        onConfirm={() => uninstall && enqueue(uninstall, false)}
        onClose={() => setUninstall(null)}
      >
        Se desinstalará con winget en silencio. Tus datos de usuario (configuraciones, partidas guardadas) normalmente se conservan.
      </Confirm>
    </>
  );
}
