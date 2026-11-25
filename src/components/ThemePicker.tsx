import { useEffect, useRef, useState } from "react";
import { PRESETS, setTheme, useTheme } from "../lib/theme";
import { IconCheck, IconPalette } from "./Icons";

/** Botón de la barra superior que abre la paleta de colores. */
export function ThemePicker() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(theme.custom ?? "#e8336d");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="theme" ref={box}>
      <button className={`pill-btn ${open ? "is-open" : ""}`} title="Colores de la interfaz" onClick={() => setOpen((v) => !v)}>
        <IconPalette size={17} />
      </button>
      {open && (
        <div className="theme__pop">
          <strong>Color de la interfaz</strong>
          <div className="theme__grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`swatch ${theme.id === p.id ? "is-sel" : ""}`}
                title={p.name}
                onClick={() => setTheme({ id: p.id })}
                style={{ background: `linear-gradient(135deg, ${p.hi}, ${p.dark})`, color: p.on }}
              >
                {theme.id === p.id && <IconCheck size={14} />}
              </button>
            ))}
          </div>
          <label className={`theme__custom ${theme.id === "custom" ? "is-sel" : ""}`}>
            <input
              type="color"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setTheme({ id: "custom", custom: e.target.value });
              }}
            />
            <span>Personalizado</span>
            <code>{custom.toUpperCase()}</code>
          </label>
          <small>Se guarda en este PC y se aplica al instante.</small>
        </div>
      )}
    </div>
  );
}
