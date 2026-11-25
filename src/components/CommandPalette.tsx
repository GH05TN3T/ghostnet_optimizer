import { useEffect, useMemo, useRef, useState } from "react";
import { useTweaks } from "../lib/store";
import { CATEGORY_LABEL } from "../lib/format";
import { IconSearch } from "./Icons";
import type { PageId } from "../App";

interface Item {
  key: string;
  label: string;
  hint: string;
  run: () => void;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function CommandPalette({
  open,
  onClose,
  pages,
  go,
}: {
  open: boolean;
  onClose: () => void;
  pages: { id: PageId; label: string }[];
  go: (page: PageId, focus?: string) => void;
}) {
  const { list } = useTweaks();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...pages.map((p) => ({ key: `p-${p.id}`, label: p.label, hint: "Página", run: () => go(p.id) })),
      ...list.map((t) => ({
        key: `t-${t.id}`,
        label: t.name,
        hint: CATEGORY_LABEL[t.category] ?? t.category,
        run: () => go("tweaks", t.id),
      })),
    ];
    const n = norm(q.trim());
    if (!n) return all.slice(0, 12);
    return all.filter((i) => norm(i.label).includes(n) || norm(i.hint).includes(n)).slice(0, 14);
  }, [q, list, pages, go]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      items[sel]?.run();
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="palette" onMouseDown={onClose}>
      <div className="palette__box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette__input">
          <IconSearch />
          <input
            ref={input}
            value={q}
            placeholder="Buscar páginas y ajustes…"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
          />
          <kbd>Esc</kbd>
        </div>
        <ul>
          {items.map((i, idx) => (
            <li
              key={i.key}
              className={idx === sel ? "is-sel" : ""}
              onMouseEnter={() => setSel(idx)}
              onClick={() => {
                i.run();
                onClose();
              }}
            >
              <span>{i.label}</span>
              <small>{i.hint}</small>
            </li>
          ))}
          {items.length === 0 && <li className="palette__empty">Sin resultados</li>}
        </ul>
      </div>
    </div>
  );
}
