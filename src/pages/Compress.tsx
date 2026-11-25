import { useEffect, useState } from "react";
import { PageHero, Perks } from "../components/Hero";
import { IconArchive, IconDatabase, IconLeaf, IconMoon, IconShield, IconSparkle } from "../components/Icons";
import { Bar, Button, Confirm, Toggle } from "../components/ui";
import { api, errMsg } from "../lib/api";
import { bytes } from "../lib/format";
import { useStats, useToast, useTweaks } from "../lib/store";

export default function Compress() {
  const toast = useToast();
  const tw = useTweaks();
  const { stats, info } = useStats();
  const [compact, setCompact] = useState("");
  const [compactBusy, setCompactBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const [dismBusy, setDismBusy] = useState(false);
  const [dismOut, setDismOut] = useState("");

  useEffect(() => {
    api.compactQuery().then(setCompact).catch(() => {});
  }, []);

  const sys = stats?.disks.find((d) => /^c:/i.test(d.mount)) ?? stats?.disks[0];
  const usedPct = sys && sys.total ? ((sys.total - sys.free) / sys.total) * 100 : 0;

  const runCompact = async (enable: boolean) => {
    setCompactBusy(true);
    toast(enable ? "Comprimiendo Windows… tarda entre 5 y 20 minutos." : "Descomprimiendo Windows…", "info");
    try {
      await api.compactSet(enable);
      setCompact(await api.compactQuery());
      toast(enable ? "Windows comprimido" : "Compresión desactivada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setCompactBusy(false);
    }
  };

  const runDism = async () => {
    setDismBusy(true);
    toast("Limpiando componentes con DISM… tarda varios minutos.", "info");
    try {
      setDismOut(await api.componentCleanup());
      toast("Limpieza de componentes terminada");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setDismBusy(false);
    }
  };

  const toggles = [
    {
      id: "hibernation",
      icon: <IconMoon size={17} />,
      title: "Quitar archivo de hibernación",
      sub: `Borra hiberfil.sys: libera ~${info ? bytes(info.ram_total * 0.4, 0) : "varios GB"}. Pierdes la opción Hibernar.`,
    },
    {
      id: "reserved_storage",
      icon: <IconDatabase size={17} />,
      title: "Quitar almacenamiento reservado",
      sub: "Libera ~7 GB que Windows guarda para actualizaciones.",
    },
  ];

  return (
    <>
      <PageHero
        icon={<IconArchive size={30} />}
        title="Comprimir"
        subtitle="Recupera espacio en el disco del sistema sin borrar tus archivos."
        art="nebula"
        side={
          <Perks
            items={[
              { icon: <IconLeaf size={16} />, title: "Más espacio", sub: "Hasta varios GB" },
              { icon: <IconShield size={16} />, title: "Sin perder nada", sub: "Todo es reversible" },
            ]}
          />
        }
      />

      {sys && (
        <section className="panel">
          <header className="panel__head">
            <IconDatabase size={16} />
            <h3>Disco del sistema {sys.mount.replace("\\", "")}</h3>
            <small>
              {bytes(sys.free)} libres de {bytes(sys.total)}
            </small>
          </header>
          <Bar value={usedPct} warn={85} danger={93} />
        </section>
      )}

      <div className="grid-2">
        <section className="panel">
          <header className="panel__head">
            <IconArchive size={16} />
            <h3>Comprimir Windows (CompactOS)</h3>
          </header>
          <p className="muted">
            Comprime los archivos del sistema con la compresión integrada de Windows. Suele liberar 2–6 GB con un impacto mínimo en SSD.
          </p>
          {compact && <pre className="out">{compact.trim()}</pre>}
          <div className="quick">
            <Button variant="primary" loading={compactBusy} onClick={() => setConfirm(true)}>
              Comprimir
            </Button>
            <Button variant="ghost" disabled={compactBusy} onClick={() => setConfirm(false)}>
              Descomprimir
            </Button>
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <IconSparkle size={16} />
            <h3>Limpieza de componentes (WinSxS)</h3>
          </header>
          <p className="muted">
            Borra con DISM las versiones antiguas de componentes que dejan las actualizaciones. Seguro, pero luego no se pueden desinstalar las
            actualizaciones ya aplicadas.
          </p>
          {dismOut && <pre className="out">{dismOut.trim().split("\n").slice(-4).join("\n")}</pre>}
          <div className="quick">
            <Button loading={dismBusy} onClick={runDism}>
              Limpiar componentes
            </Button>
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel__head">
          <IconLeaf size={16} />
          <h3>Más espacio</h3>
        </header>
        <div className="extras">
          {toggles.map((x) => (
            <div key={x.id} className="extra">
              <span className="tcard__icon">{x.icon}</span>
              <div>
                <strong>{x.title}</strong>
                <small>{x.sub}</small>
              </div>
              <Toggle on={!!tw.state[x.id]} busy={tw.busy.has(x.id)} onChange={(v) => tw.set([x.id], v)} />
            </div>
          ))}
        </div>
      </section>

      <Confirm
        open={confirm !== null}
        title={confirm ? "Comprimir Windows" : "Descomprimir Windows"}
        confirmText={confirm ? "Comprimir" : "Descomprimir"}
        onConfirm={() => runCompact(!!confirm)}
        onClose={() => setConfirm(null)}
      >
        Tarda entre 5 y 20 minutos y usa bastante disco y CPU mientras dura. No apagues el equipo hasta que termine.
      </Confirm>
    </>
  );
}
