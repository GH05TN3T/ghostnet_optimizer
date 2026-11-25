import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./components/CommandPalette";
import {
  IconBolt,
  IconBox,
  IconBroom,
  IconGamepad,
  IconGauge,
  IconHome,
  IconSearch,
  IconSliders,
} from "./components/Icons";
import { inTauri } from "./lib/api";
import { useStats } from "./lib/store";
import Home from "./pages/Home";
import Optimize from "./pages/Optimize";
import Tweaks from "./pages/Tweaks";
import Debloat from "./pages/Debloat";
import Gaming from "./pages/Gaming";
import Power from "./pages/Power";
import Cleanup from "./pages/Cleanup";

export type PageId = "home" | "optimize" | "tweaks" | "debloat" | "gaming" | "power" | "cleanup";

const PAGES: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Inicio", icon: <IconHome /> },
  { id: "optimize", label: "Optimización", icon: <IconGauge /> },
  { id: "tweaks", label: "Tweaks", icon: <IconSliders /> },
  { id: "debloat", label: "Debloat", icon: <IconBox /> },
  { id: "gaming", label: "Gaming", icon: <IconGamepad /> },
  { id: "power", label: "Energía", icon: <IconBolt /> },
  { id: "cleanup", label: "Limpieza", icon: <IconBroom /> },
];

export default function App() {
  const [page, setPage] = useState<PageId>("home");
  const [focus, setFocus] = useState<string | undefined>();
  const [palette, setPalette] = useState(false);
  const { info } = useStats();

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
          <div className="brand__logo">
            <IconGauge size={20} />
          </div>
          <div>
            <strong>Optimizador</strong>
            <small>Windows 10 / 11</small>
          </div>
        </div>

        <button className="search-btn" onClick={() => setPalette(true)}>
          <IconSearch size={16} />
          <span>Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>

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
