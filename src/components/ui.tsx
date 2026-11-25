import type { ReactNode } from "react";
import { IconAlert, IconX } from "./Icons";

export function Toggle({
  on,
  busy,
  disabled,
  onChange,
}: {
  on: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`toggle ${on ? "is-on" : ""} ${busy ? "is-busy" : ""}`}
      disabled={disabled || busy}
      onClick={() => onChange(!on)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  loading,
  disabled,
  icon,
  small,
  title,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  small?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`btn btn--${variant} ${small ? "btn--sm" : ""}`}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className="spinner" /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card__head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, kind = "default" }: { children: ReactNode; kind?: "default" | "ok" | "warn" | "danger" }) {
  return <span className={`badge badge--${kind}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}

export function Confirm({
  open,
  title,
  children,
  confirmText = "Continuar",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal" onMouseDown={onClose}>
      <div className="modal__box" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          {danger && <IconAlert className="text-danger" />}
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <IconX />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        <footer>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Bar({ value, warn = 75, danger = 90 }: { value: number; warn?: number; danger?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const kind = v >= danger ? "danger" : v >= warn ? "warn" : "ok";
  return (
    <div className="bar">
      <div className={`bar__fill bar__fill--${kind}`} style={{ width: `${v}%` }} />
    </div>
  );
}
