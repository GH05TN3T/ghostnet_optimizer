import type { TweakInfo } from "../lib/api";
import { useTweaks } from "../lib/store";
import { Badge, Toggle } from "./ui";

export function TweakRow({ t, highlight }: { t: TweakInfo; highlight?: boolean }) {
  const { state, busy, set } = useTweaks();
  const on = !!state[t.id];
  return (
    <div className={`tweak ${highlight ? "is-highlight" : ""}`} id={`tweak-${t.id}`}>
      <div className="tweak__text">
        <div className="tweak__title">
          <span>{t.name}</span>
          {t.recommended && <Badge kind="ok">Recomendado</Badge>}
          {t.risk === "high" && <Badge kind="danger">Riesgo</Badge>}
          {t.reboot && <Badge>Requiere reinicio</Badge>}
          {t.explorer && <Badge>Reiniciar Explorador</Badge>}
        </div>
        <p>{t.desc}</p>
      </div>
      <Toggle on={on} busy={busy.has(t.id)} onChange={(v) => set([t.id], v)} />
    </div>
  );
}

export function TweakList({ items, highlight }: { items: TweakInfo[]; highlight?: string }) {
  return (
    <div className="tweak-list">
      {items.map((t) => (
        <TweakRow key={t.id} t={t} highlight={t.id === highlight} />
      ))}
    </div>
  );
}
