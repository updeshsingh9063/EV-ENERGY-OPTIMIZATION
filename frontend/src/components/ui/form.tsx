import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-3">{eyebrow}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink-1 sm:text-[32px] sm:leading-[38px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Select({
  label,
  id,
  hint,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; id: string; hint?: ReactNode }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-ink-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          className="h-9 w-full appearance-none rounded-sm border border-line-strong bg-surface-1 pl-2.5 pr-8 text-sm text-ink-1 outline-none transition-[border-color,box-shadow] focus:border-focus focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--focus)_22%,transparent)]"
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
      </div>
      {hint && <p className="text-2xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  disabled,
  title,
  description,
  aside,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
        checked ? "border-line-strong bg-surface-2" : "border-line hover:bg-surface-2/60",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={clsx(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-xs border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-focus",
          checked ? "border-brand bg-brand text-ink-inverse" : "border-line-strong bg-surface-1",
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink-1">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-3">{description}</span>}
      </span>
      {aside}
    </label>
  );
}

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="bg-surface-1 p-3">
      <dt className="text-2xs text-ink-3">{label}</dt>
      <dd className="mt-0.5">
        <span className="num text-md text-ink-1">{value}</span>
        {unit && <span className="ml-1 text-xs text-ink-3">{unit}</span>}
      </dd>
    </div>
  );
}

export function StatGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <dl
      className={clsx(
        "grid gap-px overflow-hidden rounded-md border border-line bg-line",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-2 sm:grid-cols-3",
        cols === 4 && "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {children}
    </dl>
  );
}
