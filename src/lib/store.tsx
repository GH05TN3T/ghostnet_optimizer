import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errMsg, inTauri, type LiveStats, type SysInfo, type TweakInfo } from "./api";

/* ---------------- Toasts ---------------- */

export type ToastKind = "ok" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, kind, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {list.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Tweaks ---------------- */

interface TweaksState {
  list: TweakInfo[];
  state: Record<string, boolean>;
  loading: boolean;
  busy: Set<string>;
  refresh: () => Promise<void>;
  /** Aplica (true) o revierte (false). Devuelve true si todo quedó como se pidió. */
  set: (ids: string[], enable: boolean) => Promise<boolean>;
}

const TweaksCtx = createContext<TweaksState>(null!);
export const useTweaks = () => useContext(TweaksCtx);

function TweaksProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [list, setList] = useState<TweakInfo[]>([]);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([api.listTweaks(), api.checkTweaks()]);
      setList(l);
      setState(s);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const set = useCallback(
    async (ids: string[], enable: boolean) => {
      setBusy((b) => new Set([...b, ...ids]));
      let ok = true;
      try {
        const res = await api.setTweaks(ids, enable);
        setState((s) => ({ ...s, ...res }));
        const failed = ids.filter((id) => res[id] !== enable);
        if (failed.length) {
          ok = false;
          toast(
            failed.length === 1
              ? "Windows no dejó aplicar el cambio (puede estar bloqueado por una directiva o por Protección contra alteraciones)."
              : `${failed.length} cambios no se pudieron aplicar del todo.`,
            "error",
          );
        }
      } catch (e) {
        ok = false;
        toast(errMsg(e), "error");
        try {
          const res = await api.checkTweaks(ids);
          setState((s) => ({ ...s, ...res }));
        } catch {
          /* ignorar */
        }
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          ids.forEach((id) => n.delete(id));
          return n;
        });
      }
      return ok;
    },
    [toast],
  );

  const value = useMemo(() => ({ list, state, loading, busy, refresh, set }), [list, state, loading, busy, refresh, set]);
  return <TweaksCtx.Provider value={value}>{children}</TweaksCtx.Provider>;
}

/* ---------------- Medidores en vivo ---------------- */

const HISTORY = 60;

export interface History {
  cpu: number[];
  ram: number[];
  gpu: number[];
  down: number[];
  up: number[];
  disk: number[];
}

interface StatsState {
  stats: LiveStats | null;
  history: History;
  info: SysInfo | null;
}

const StatsCtx = createContext<StatsState>(null!);
export const useStats = () => useContext(StatsCtx);

function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [info, setInfo] = useState<SysInfo | null>(null);
  const hist = useRef<History>({ cpu: [], ram: [], gpu: [], down: [], up: [], disk: [] });
  const [history, setHistory] = useState<History>(hist.current);

  useEffect(() => {
    if (!inTauri) return;
    api.systemInfo().then(setInfo).catch(() => {});
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const s = await api.liveStats();
        if (!alive) return;
        const h = hist.current;
        const push = (arr: number[], v: number) => [...arr, v].slice(-HISTORY);
        hist.current = {
          cpu: push(h.cpu, s.cpu),
          ram: push(h.ram, s.ram_total ? (s.ram_used / s.ram_total) * 100 : 0),
          gpu: push(h.gpu, Math.max(0, s.gpu)),
          down: push(h.down, s.net_down),
          up: push(h.up, s.net_up),
          disk: push(h.disk, s.disk_read + s.disk_write),
        };
        setStats(s);
        setHistory(hist.current);
      } catch {
        /* sigue intentando */
      }
      if (alive) timer = window.setTimeout(tick, 1000);
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return <StatsCtx.Provider value={{ stats, history, info }}>{children}</StatsCtx.Provider>;
}

/* ---------------- Raíz ---------------- */

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <StatsProvider>
        <TweaksProvider>{children}</TweaksProvider>
      </StatsProvider>
    </ToastProvider>
  );
}
