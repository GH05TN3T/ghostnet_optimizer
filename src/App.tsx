import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./components/CommandPalette";
import logo from "./assets/logo.png";
import {
  IconArchive,
  IconBolt,
  IconBroom,
  IconGamepad,
  IconGrid,
  IconHome,
  IconRestore,
  IconSearch,
  IconShield,
  IconSliders,
  IconTrash,
  IconWrench,
} from "./components/Icons";
import { api, errMsg, inTauri } from "./lib/api";
import { useStats, useToast } from "./lib/store";
import Home from "./pages/Home";
import Optimize from "./pages/Optimize";
import Tweaks from "./pages/Tweaks";
import Debloat from "./pages/Debloat";
import Gaming from "./pages/Gaming";
import Power from "./pages/Power";
import Cleanup from "./pages/Cleanup";
import Apps from "./pages/Apps";
import Compress from "./pages/Compress";

export type PageId = "home" | "gaming" | "apps" | "debloat" | "cleanup" | "optimize" | "tweaks" | "compress" | "power";

const PAGES: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Inicio", icon: <IconHome /> },
  { id: "gaming", label: "Gaming", icon: <IconGamepad /> },
  { id: "apps", label: "Apps", icon: <IconGrid /> },
  { id: "debloat", label: "Debloat", icon: <IconTrash /> },
  { id: "cleanup", label: "Limpieza", icon: <IconBroom /> },
  { id: "optimize", label: "Optimización", icon: <IconSliders /> },
  { id: "tweaks", label: "Tweaks", icon: <IconWrench /> },
  { id: "compress", label: "Comprimir", icon: <IconArchive /> },
  { id: "power", label: "Energía", icon: <IconBolt /> },
];

export default function App() {
  const [page, setPage] = useState<PageId>("home");
  const [focus, setFocus] = useState<string | undefined>();
  const [palette, setPalette] = useState(false);
  const { info } = useStats();
  const toast = useToast();
  const [rp, setRp] = useState(false);

  const restorePoint = async () => {
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

  const go = useCallback((p: PageId, f?: string) => {
    setPage(p);
    setFocus(f);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand__img" src={logo} alt="GhostNet" />
          <div>
            <strong>GhostNet</strong>
            <small>Optimizer</small>
          </div>
        </div>

        <nav>
          {PAGES.map((p) => (
            <button key={p.id} className={`nav-item ${page === p.id ? "is-active" : ""}`} onClick={() => go(p.id)}>
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__foot">
          {info && (
            <>
              <span className={`dot ${info.is_admin ? "dot--ok" : "dot--warn"}`} />
              <span>{info.is_admin ? "Administrador" : "Sin permisos de admin"}</span>
            </>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar">{info?.user?.[0]?.toUpperCase() ?? "?"}</div>
            {info && (
              <div>
                <strong>{info.user}</strong>
                <small>{info.host}</small>
              </div>
            )}
          </div>
          <div className="topbar__pill">
            <button className="search-btn" onClick={() => setPalette(true)}>
              <IconSearch size={15} />
              <span>Buscar</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button className="pill-btn" title="Crear punto de restauración" disabled={rp} onClick={restorePoint}>
              {rp ? <span className="spinner spinner--sm" /> : <IconShield size={17} />}
            </button>
            <button className="pill-btn" title="Abrir Restaurar sistema" onClick={() => api.openRestoreUi().catch((e) => toast(errMsg(e), "error"))}>
              <IconRestore size={17} />
            </button>
          </div>
        </header>
        {!inTauri && (
          <div className="banner banner--warn">
            Estás viendo la interfaz en el navegador. Para que funcione de verdad, ábrela con <code>npm run app:dev</code> en Windows.
          </div>
        )}
        {info && !info.is_admin && (
          <div className="banner banner--warn">
            La app no tiene permisos de administrador: la mayoría de los cambios fallarán. Abre la terminal como administrador
            (o usa el instalador, que lo pide solo).
          </div>
        )}
        <div className="page" key={page}>
          {page === "home" && <Home go={go} />}
          {page === "optimize" && <Optimize go={go} />}
          {page === "tweaks" && <Tweaks focus={focus} />}
          {page === "debloat" && <Debloat />}
          {page === "gaming" && <Gaming />}
          {page === "power" && <Power />}
          {page === "cleanup" && <Cleanup />}
          {page === "apps" && <Apps />}
          {page === "compress" && <Compress />}
        </div>
      </main>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        pages={PAGES.map(({ id, label }) => ({ id, label }))}
        go={go}
      />
    </div>
  );
}
