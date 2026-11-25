import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState, type ReactNode } from "react";
import { PageHero, Perks } from "../components/Hero";
import {
  IconCheck,
  IconCpu,
  IconDisc,
  IconExternal,
  IconFolder,
  IconGamepad,
  IconLayers,
  IconLeaf,
  IconRocket,
  IconShield,
  IconUser,
  IconX,
} from "../components/Icons";
import { Badge, Button, Toggle } from "../components/ui";
import { api, errMsg, type BuildOptions, type IsoInfo } from "../lib/api";
import { BUILD_STEPS, builderStore, useBuilder } from "../lib/builder";
import { bytes } from "../lib/format";
import { useToast } from "../lib/store";

type ProfileId = BuildOptions["profile"];

const PROFILES: { id: ProfileId; name: string; icon: ReactNode; desc: string; removes: string[]; keeps: string[]; warn?: string }[] = [
  {
    id: "ligero",
    name: "Ligero",
    icon: <IconLeaf size={20} />,
    desc: "Windows 11 limpio para el día a día.",
    removes: ["Apps patrocinadas y sugerencias", "Copilot, Recall, Widgets", "Teams, Outlook nuevo, Clipchamp, Noticias…", "Telemetría al mínimo"],
    keeps: ["Microsoft Store", "Defender", "Windows Update", "Edge y OneDrive", "Xbox"],
  },
  {
    id: "gaming",
    name: "Gaming",
    icon: <IconGamepad size={20} />,
    desc: "Ligero + ajustes para juegos y menos procesos.",
    removes: ["Todo lo del perfil Ligero", "Edge (se conserva WebView2)", "OneDrive", "Game DVR y aceleración del ratón", "Almacenamiento reservado (~7 GB)"],
    keeps: ["Microsoft Store", "Defender", "Windows Update", "Xbox y Game Pass"],
  },
  {
    id: "minimo",
    name: "Mínimo",
    icon: <IconCpu size={20} />,
    desc: "Lo más recortado posible, para PCs viejos o máquinas virtuales.",
    removes: ["Todo lo del perfil Gaming", "Microsoft Store y Xbox", "Componentes opcionales (IE, voz, escritura…)"],
    keeps: ["Explorador y búsqueda", "Bloc de notas, Paint, Fotos, Calculadora"],
    warn: "Sin Windows Update ni Defender: no recibirás parches de seguridad. Úsalo solo si sabes lo que haces.",
  },
];

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}

function dirOf(path: string) {
  const i = path.lastIndexOf("\\");
  return i > 0 ? path.slice(0, i) : path;
}

export default function Builder() {
  const toast = useToast();
  const b = useBuilder();
  const [iso, setIso] = useState<string>("");
  const [info, setInfo] = useState<IsoInfo | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [hash, setHash] = useState<string>("");
  const [hashing, setHashing] = useState(false);
  const [profile, setProfile] = useState<ProfileId>("gaming");
  const [opts, setOpts] = useState({ bypass: true, local_account: true, deep_clean: true, esd: false });
  const [out, setOut] = useState<string>("");
  const [, tick] = useState(0);

  const running = b.status === "running";

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const pickIso = async () => {
    try {
      const f = await open({ multiple: false, directory: false, filters: [{ name: "Imagen ISO", extensions: ["iso"] }] });
      if (!f || Array.isArray(f)) return;
      setIso(f);
      setInfo(null);
      setHash("");
      setIndex(null);
      setOut(`${dirOf(f)}\\GhostNet-Win11-${profile}.iso`);
      setInspecting(true);
      const i = await api.builderInspect(f);
      setInfo(i);
      const pro = i.editions.find((e) => /pro$/i.test(e.name.trim())) ?? i.editions.find((e) => /pro/i.test(e.name)) ?? i.editions[0];
      setIndex(pro?.index ?? null);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setInspecting(false);
    }
  };

  const pickOut = async () => {
    try {
      const f = await save({ defaultPath: out || `GhostNet-Win11-${profile}.iso`, filters: [{ name: "Imagen ISO", extensions: ["iso"] }] });
      if (f) setOut(f.toLowerCase().endsWith(".iso") ? f : `${f}.iso`);
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const doHash = async () => {
    setHashing(true);
    try {
      setHash(await api.builderHash(iso));
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setHashing(false);
    }
  };

  const chooseProfile = (p: ProfileId) => {
    setProfile(p);
    if (out && /GhostNet-Win11-(ligero|gaming|minimo)\.iso$/i.test(out)) setOut(out.replace(/(ligero|gaming|minimo)\.iso$/i, `${p}.iso`));
  };

  const start = async () => {
    if (!iso || index == null || !out) return;
    builderStore.begin(iso, out);
    try {
      await api.builderStart({ iso, out, index, profile, ...opts });
    } catch (e) {
      builderStore.set({ status: "error", error: errMsg(e) });
    }
  };

  const cancel = async () => {
    if (!b.out || !b.iso) return;
    builderStore.set({ status: "cancelled" });
    try {
      await api.builderCancel(b.out, b.iso);
      toast("Compilación cancelada y temporales borrados", "info");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  };

  const ready = !!iso && !!info && index != null && !!out && !running;
  const edition = info?.editions.find((e) => e.index === index);
  const prof = PROFILES.find((p) => p.id === profile)!;

  const optionRows: { key: keyof typeof opts; title: string; sub: string }[] = [
    { key: "bypass", title: "Saltar requisitos de hardware", sub: "Instala en PCs sin TPM 2.0, Secure Boot o CPU compatible." },
    { key: "local_account", title: "Cuenta local sin Internet", sub: "Sin cuenta Microsoft obligatoria y sin pantallas de publicidad al instalar." },
    { key: "deep_clean", title: "Limpieza profunda de componentes", sub: "ISO más pequeña (DISM /ResetBase). Tarda unos minutos más." },
    { key: "esd", title: "Compresión máxima (ESD)", sub: "La ISO pesa bastante menos, pero tarda mucho más en crearse." },
  ];

  return (
    <>
      <PageHero
        icon={<IconLayers size={30} />}
        eyebrow="Builder"
        title="Tu Windows, sin bloatware"
        subtitle="Crea una ISO de Windows 11 limpia a partir de la oficial de Microsoft. Tú pones la ISO y tu licencia."
        art="tiles"
        side={
          <Perks
            items={[
              { icon: <IconShield size={16} />, title: "ISO oficial", sub: "No se modifica la original" },
              { icon: <IconLeaf size={16} />, title: "Sin bloatware", sub: "Ni apps patrocinadas" },
              { icon: <IconUser size={16} />, title: "Cuenta local", sub: "Sin cuenta Microsoft" },
            ]}
          />
        }
      />

      {b.status !== "idle" && (
        <section className={`panel build build--${b.status}`}>
          <header className="panel__head">
            <IconDisc size={16} />
            <h3>
              {b.status === "running"
                ? "Creando tu ISO…"
                : b.status === "done"
                  ? "ISO creada"
                  : b.status === "error"
                    ? "La compilación falló"
                    : "Compilación cancelada"}
            </h3>
            {b.status === "running" && <small>Tiempo total: {elapsed(Date.now() - b.started)}</small>}
            <div className="panel__actions">
              {b.status === "running" ? (
                <Button small variant="danger" icon={<IconX size={14} />} onClick={cancel}>
                  Cancelar
                </Button>
              ) : (
                <Button small variant="ghost" onClick={builderStore.reset}>
                  Cerrar
                </Button>
              )}
            </div>
          </header>

          {b.status === "done" && b.result && (
            <div className="build__done">
              <span className="build__done-icon">
                <IconCheck size={22} />
              </span>
              <div>
                <strong>{b.result.path}</strong>
                <small>
                  {bytes(b.result.size)} · en {elapsed(Date.now() - b.started)}. Grábala en un USB con Rufus o Ventoy (están en Apps) y arranca desde él.
                </small>
              </div>
              <Button icon={<IconFolder size={15} />} onClick={() => api.revealFile(b.result!.path).catch((e) => toast(errMsg(e), "error"))}>
                Mostrar en carpeta
              </Button>
            </div>
          )}
          {b.status === "error" && <div className="banner banner--danger">{b.error}</div>}

          <ol className="build__steps">
            {BUILD_STEPS.map((s, i) => {
              const n = i + 1;
              const st = b.status === "done" || n < b.step ? "done" : n === b.step ? (b.status === "running" ? "now" : "stopped") : "todo";
              return (
                <li key={s} className={`is-${st}`}>
                  <span className="build__dot">{st === "done" ? <IconCheck size={12} /> : st === "now" ? <span className="spinner spinner--sm" /> : n}</span>
                  <span>{s}</span>
                  {st === "now" && <small>{elapsed(Date.now() - b.stepStarted)}</small>}
                </li>
              );
            })}
          </ol>
          {b.log.length > 0 && <pre className="out build__log">{b.log.slice(-8).join("\n")}</pre>}
        </section>
      )}

      <div className="opt">
        <div className="opt__main">
          <section className="panel">
            <header className="panel__head panel__head--big">
              <span className="step-num">1</span>
              <div>
                <h3>ISO de Windows 11</h3>
                <small className="muted">La oficial de Microsoft. No se modifica: se crea una ISO nueva.</small>
              </div>
              <div className="panel__actions">
                <Button small variant="ghost" icon={<IconExternal size={14} />} onClick={() => api.openIsoDownload().catch(() => {})}>
                  Descargar ISO oficial
                </Button>
                <Button small variant="primary" icon={<IconDisc size={14} />} loading={inspecting} disabled={running} onClick={pickIso}>
                  {iso ? "Cambiar ISO" : "Elegir ISO…"}
                </Button>
              </div>
            </header>
            {!iso && <p className="muted">Todavía no has elegido ninguna ISO.</p>}
            {iso && (
              <div className="iso">
                <div className="iso__file">
                  <IconDisc size={18} />
                  <div>
                    <strong title={iso}>{iso.split("\\").pop()}</strong>
                    <small>
                      {info ? `${bytes(info.size)} · ${info.arch} · compilación ${info.version}${info.esd ? " · install.esd" : ""}` : inspecting ? "Leyendo la ISO…" : ""}
                    </small>
                  </div>
                  <Button small variant="ghost" loading={hashing} disabled={running} onClick={doHash} title="Compara el resultado con el que publica Microsoft en su página de descarga">
                    SHA-256
                  </Button>
                </div>
                {hash && (
                  <p className="iso__hash">
                    SHA-256: <code>{hash}</code>
                  </p>
                )}
                {info && (
                  <div className="radios radios--grid">
                    {info.editions.map((e) => (
                      <button key={e.index} className={`radio ${index === e.index ? "is-sel" : ""}`} disabled={running} onClick={() => setIndex(e.index)}>
                        <span className="radio__dot" />
                        {e.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel__head panel__head--big">
              <span className="step-num">2</span>
              <div>
                <h3>Perfil</h3>
                <small className="muted">Qué se quita y qué se conserva.</small>
              </div>
            </header>
            <div className="bprofiles">
              {PROFILES.map((p) => (
                <button key={p.id} className={`bprofile ${profile === p.id ? "is-sel" : ""}`} disabled={running} onClick={() => chooseProfile(p.id)}>
                  <div className="bprofile__head">
                    <span className="pcard__icon">{p.icon}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.desc}</small>
                    </div>
                    <span className={`radio-btn ${profile === p.id ? "is-on" : ""}`}>
                      <span />
                    </span>
                  </div>
                  <div className="bprofile__lists">
                    <div>
                      <b>Quita</b>
                      <ul>
                        {p.removes.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <b>Conserva</b>
                      <ul className="keeps">
                        {p.keeps.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {p.warn && <p className="bprofile__warn">{p.warn}</p>}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel__head panel__head--big">
              <span className="step-num">3</span>
              <div>
                <h3>Opciones</h3>
                <small className="muted">Se aplican dentro de la ISO, no en este PC.</small>
              </div>
            </header>
            <div className="extras">
              {optionRows.map((r) => (
                <div key={r.key} className="extra">
                  <div>
                    <strong>{r.title}</strong>
                    <small>{r.sub}</small>
                  </div>
                  <Toggle on={opts[r.key]} disabled={running} onChange={(v) => setOpts((o) => ({ ...o, [r.key]: v }))} />
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <header className="panel__head panel__head--big">
              <span className="step-num">4</span>
              <div>
                <h3>Dónde guardar la ISO</h3>
                <small className="muted">En esa unidad hacen falta unos 20 GB libres mientras se crea.</small>
              </div>
              <div className="panel__actions">
                <Button small icon={<IconFolder size={14} />} disabled={running} onClick={pickOut}>
                  Cambiar…
                </Button>
              </div>
            </header>
            <p className="iso__out">{out || <span className="muted">Elige primero la ISO de origen.</span>}</p>
          </section>
        </div>

        <aside className="opt__side">
          <section className="panel recpanel">
            <header className="panel__head">
              <IconRocket size={16} />
              <h3>Resumen</h3>
            </header>
            <ul className="bsummary">
              <li>
                <span>ISO</span>
                <b>{iso ? iso.split("\\").pop() : "—"}</b>
              </li>
              <li>
                <span>Edición</span>
                <b>{edition?.name ?? "—"}</b>
              </li>
              <li>
                <span>Perfil</span>
                <b className="tone-pink">{prof.name}</b>
              </li>
              <li>
                <span>Requisitos</span>
                <b>{opts.bypass ? "Sin TPM/CPU" : "Normales"}</b>
              </li>
              <li>
                <span>Compresión</span>
                <b>{opts.esd ? "Máxima (ESD)" : "Normal (WIM)"}</b>
              </li>
            </ul>
            {profile === "minimo" && <Badge kind="danger">Sin Windows Update ni Defender</Badge>}
            <p className="muted small">
              Tarda entre 20 y 60 minutos según el PC. Puedes seguir usando la app mientras tanto. Necesitarás tu propia licencia de Windows al
              instalar.
            </p>
            <button className="cta-big" disabled={!ready} onClick={start}>
              {running ? <span className="spinner" /> : <IconDisc size={17} />}
              <span>{running ? "Creando ISO…" : "Crear ISO"}</span>
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
