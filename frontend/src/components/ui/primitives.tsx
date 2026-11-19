import clsx from "clsx";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
    size === "sm" && "h-7 px-2.5 text-xs rounded-sm",
    size === "md" && "h-8 px-3 text-sm rounded-sm",
    size === "lg" && "h-10 px-4 text-base rounded-md",
    variant === "primary" && "bg-brand text-ink-inverse hover:bg-brand-hover shadow-card",
    variant === "secondary" &&
      "bg-surface-1 text-ink-1 border border-line-strong hover:bg-surface-2 hover:border-ink-3/40 shadow-card",
    variant === "ghost" && "text-ink-2 hover:text-ink-1 hover:bg-surface-2",
    variant === "danger" && "bg-critical text-white hover:brightness-110",
  );
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button className={clsx(buttonClasses(variant, size), className)} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-lg border border-line bg-surface-1 shadow-card", className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3 px-5 pt-4", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-ink-1">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge */

export type Status = "good" | "warning" | "critical" | "running" | "neutral";

const statusIcon = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
  running: Loader2,
  neutral: CircleDashed,
};

/** Status always ships with icon + label, never colour alone. */
export function StatusBadge({ status, children }: { status: Status; children: ReactNode }) {
  const Icon = statusIcon[status];
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-2xs font-medium",
        status === "good" && "bg-good-bg text-good-ink",
        status === "warning" && "bg-warning-bg text-warning-ink",
        status === "critical" && "bg-critical-bg text-critical-ink",
        status === "running" && "bg-surface-2 text-ink-2",
        status === "neutral" && "bg-surface-2 text-ink-3",
      )}
    >
      <Icon className={clsx("size-3", status === "running" && "animate-spin")} aria-hidden />
      {children}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex h-5 items-center rounded-xs border border-line px-1.5 text-2xs font-medium text-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------- Skeleton / Empty */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-md border border-line bg-surface-2 text-ink-2">
        {icon}
      </div>
      <h3 className="text-md font-medium text-ink-1">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------ Segmented control */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "h-7 rounded-sm px-2.5 text-xs font-medium transition-colors duration-150",
              active ? "bg-surface-1 text-ink-1 shadow-card" : "text-ink-3 hover:text-ink-1",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- Form field */

export function Field({
  label,
  hint,
  error,
  unit,
  id,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; unit?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
      </label>
      <div
        className={clsx(
          "flex h-9 items-center rounded-sm border bg-surface-1 transition-[border-color,box-shadow] duration-150",
          "focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--focus)_22%,transparent)]",
          error ? "border-critical" : "border-line-strong focus-within:border-focus",
        )}
      >
        <input
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={hint || error ? `${id}-desc` : undefined}
          className="num h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-ink-1 outline-none placeholder:text-ink-3"
          {...input}
        />
        {unit && <span className="pr-2.5 text-xs text-ink-3">{unit}</span>}
      </div>
      {(hint || error) && (
        <p id={`${id}-desc`} className={clsx("text-2xs", error ? "text-critical-ink" : "text-ink-3")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Swatch */

export function SeriesKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <svg width="14" height="8" aria-hidden>
        <line
          x1="0"
          y1="4"
          x2="14"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={dashed ? "3 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}
