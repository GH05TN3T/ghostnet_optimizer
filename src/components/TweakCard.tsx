import { useState, type ReactNode } from "react";
import type { Category, TweakInfo } from "../lib/api";
import { CATEGORY_LABEL } from "../lib/format";
import { useTweaks } from "../lib/store";
import { IconBolt, IconChevron, IconCpu, IconEyeOff, IconGpu, IconMonitor, IconShield, IconX } from "./Icons";
import { Badge, Button, Toggle } from "./ui";

export const CATEGORY_ICON: Record<Category, (size: number) => ReactNode> = {
  privacidad: (s) => <IconEyeOff size={s} />,
  interfaz: (s) => <IconMonitor size={s} />,
  sistema: (s) => <IconCpu size={s} />,
  rendimiento: (s) => <IconBolt size={s} />,
  gpu: (s) => <IconGpu size={s} />,
  seguridad: (s) => <IconShield size={s} />,
};

export function TweakDetails({ t, onClose }: { t: TweakInfo; onClose: () => void }) {
  const { state, busy, set } = useTweaks();
  const on = !!state[t.id];
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__box modal__box--wide" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <span className="tcard__icon">{CATEGORY_ICON[t.category](17)}</span>
          <h3>{t.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <IconX />
          </button>
        </header>
        <div className="modal__body">
          <div className="tcard__badges">
            <Badge>{CATEGORY_LABEL[t.category]}</Badge>
            {t.recommended && <Badge kind="ok">Recomendado</Badge>}
            {t.risk === "high" && <Badge kind="danger">Riesgo alto</Badge>}
            {t.reboot && <Badge kind="warn">Requiere reinicio</Badge>}
            {t.explorer && <Badge kind="warn">Reiniciar Explorador</Badge>}
            <Badge kind={on ? "ok" : "default"}>{on ? "Aplicado" : "No aplicado"}</Badge>
          </div>
          <p>{t.desc}</p>
          <h4 className="details__title">Qué cambia</h4>
          <ul className="details__list">
            {t.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="muted small">Desactivarlo devuelve cada valor a su estado original de Windows.</p>
        </div>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant={on ? "default" : "primary"} loading={busy.has(t.id)} onClick={() => set([t.id], !on)}>
            {on ? "Revertir" : "Aplicar"}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function TweakCard({ t }: { t: TweakInfo }) {
  const { state, busy, set } = useTweaks();
  const [open, setOpen] = useState(false);
  const on = !!state[t.id];
  return (
    <div className={`tcard ${on ? "is-on" : ""}`}>
      <div className="tcard__top">
        <span className="tcard__icon">{CATEGORY_ICON[t.category](17)}</span>
        <strong title={t.name}>{t.name}</strong>
        <Toggle on={on} busy={busy.has(t.id)} onChange={(v) => set([t.id], v)} />
      </div>
      <p className="tcard__desc">{t.desc}</p>
      <div className="tcard__foot">
        <div className="tcard__badges">
          {t.recommended && <Badge kind="ok">Recomendado</Badge>}
          {t.risk === "high" && <Badge kind="danger">Riesgo</Badge>}
          {t.reboot && <Badge kind="warn">Reinicio</Badge>}
        </div>
        <button className="tcard__more" onClick={() => setOpen(true)}>
          Detalles <IconChevron size={13} />
        </button>
      </div>
      {open && <TweakDetails t={t} onClose={() => setOpen(false)} />}
    </div>
  );
}
