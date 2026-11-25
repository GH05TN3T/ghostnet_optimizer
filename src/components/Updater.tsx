import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg, inTauri } from "../lib/api";
import { bytes } from "../lib/format";
import { useToast } from "../lib/store";
import { IconDownload, IconRefresh, IconX } from "./Icons";

type Phase = "idle" | "checking" | "available" | "downloading" | "installing";

/**
 * Busca actualizaciones en GitHub Releases (latest.json firmado).
 * La firma se comprueba con la clave pública de tauri.conf.json antes de instalar nada.
 */
export function useUpdater() {
  const toast = useToast();
  const [version, setVersion] = useState<string>("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [dismissed, setDismissed] = useState(false);
  const checkedOnce = useRef(false);

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (!inTauri) return;
      setPhase("checking");
      try {
        const u = await check();
        if (u) {
          setUpdate(u);
          setDismissed(false);
          setPhase("available");
        } else {
          setPhase("idle");
          if (manual) toast("Ya tienes la última versión");
        }
      } catch (e) {
        setPhase("idle");
        if (manual) toast(`No se pudo buscar actualizaciones: ${errMsg(e)}`, "error");
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!inTauri || checkedOnce.current) return;
    checkedOnce.current = true;
    getVersion().then(setVersion).catch(() => {});
    const t = window.setTimeout(() => runCheck(false), 4000);
    return () => window.clearTimeout(t);
  }, [runCheck]);

  const install = useCallback(async () => {
    if (!update) return;
    setPhase("downloading");
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data.contentLength ?? 0;
          setProgress({ done: 0, total });
        } else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          setProgress({ done, total });
        } else if (ev.event === "Finished") {
          setPhase("installing");
        }
      });
      // En Windows el instalador cierra la app; si sigue abierta, la reiniciamos.
      await relaunch();
    } catch (e) {
      setPhase("available");
      toast(`La actualización falló: ${errMsg(e)}`, "error");
    }
  }, [update, toast]);

  return { version, update, phase, progress, dismissed, setDismissed, install, check: () => runCheck(true) };
}

export function UpdateBanner({ u }: { u: ReturnType<typeof useUpdater> }) {
  if (!u.update || u.dismissed || u.phase === "idle" || u.phase === "checking") return null;
  const pct = u.progress.total ? Math.round((u.progress.done / u.progress.total) * 100) : 0;
  const busy = u.phase === "downloading" || u.phase === "installing";
  return (
    <div className="update">
      <span className="update__icon">
        <IconDownload size={18} />
      </span>
      <div className="update__text">
        <strong>Nueva versión {u.update.version} disponible</strong>
        <small>
          {u.phase === "downloading"
            ? `Descargando… ${pct}%${u.progress.total ? ` · ${bytes(u.progress.done)} de ${bytes(u.progress.total)}` : ""}`
            : u.phase === "installing"
              ? "Instalando… la app se reiniciará sola."
              : u.update.body?.trim() || "Mejoras y correcciones."}
        </small>
        {u.phase === "downloading" && (
          <div className="update__bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <button className="btn btn--primary btn--sm" disabled={busy} onClick={u.install}>
        {busy ? <span className="spinner" /> : <IconRefresh size={15} />}
        <span>{busy ? "Actualizando" : "Actualizar ahora"}</span>
      </button>
      {!busy && (
        <button className="icon-btn" title="Más tarde" onClick={() => u.setDismissed(true)}>
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}
