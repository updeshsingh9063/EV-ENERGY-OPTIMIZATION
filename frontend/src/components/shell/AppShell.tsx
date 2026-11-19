"use client";

import clsx from "clsx";
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { AccountMenu } from "@/components/shell/AccountMenu";
import { StoreProvider, useActiveVehicle, useStore, vehicleSummary } from "@/lib/store";



function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2" aria-label="VoltSplit home">
      <span className="grid size-7 place-items-center rounded-sm bg-ink-1">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 3h4v10H3z" fill="var(--bg)" opacity="0.9" />
          <path d="M9 9h4v4H9z" fill="var(--volt)" />
          <path d="M9 3h4v4H9z" fill="var(--bg)" opacity="0.45" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink-1">VoltSplit</span>
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(t ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("vs-theme", next);
        } catch {}
        setTheme(next);
      }}
      className="grid size-8 place-items-center rounded-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mb-1 px-2 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">{g.group}</div>
          <ul className="flex flex-col gap-px">
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "group relative flex h-8 items-center gap-2.5 rounded-sm px-2 text-sm transition-colors duration-150",
                      active ? "bg-surface-1 text-ink-1 shadow-card" : "text-ink-2 hover:bg-surface-2 hover:text-ink-1",
                    )}
                  >
                    <Icon
                      className={clsx("size-4 shrink-0", active ? "text-ink-1" : "text-ink-3 group-hover:text-ink-2")}
                      aria-hidden
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function LoadError() {
  const { error, reload } = useStore();
  if (!error) return null;
  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-critical-bg px-4 py-3 text-sm text-critical-ink">
      <span className="flex-1">Couldn&apos;t load your workspace: {error}</span>
      <button onClick={() => reload()} className="rounded-sm border border-current px-2 py-0.5 text-xs font-medium">
        Retry
      </button>
    </div>
  );
}

function ActiveVehicleCard() {
  const v = useActiveVehicle();
  const s = vehicleSummary(v.config);
  return (
    <Link
      href={`/vehicles?v=${v.id}`}
      className="mt-auto block rounded-md border border-line bg-surface-1 p-3 transition-colors hover:border-line-strong"
    >
      <div className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">Active vehicle</div>
      <div className="mt-1 truncate text-sm font-medium text-ink-1">
        {v.name} · {s.packKwh.toFixed(0)} kWh
      </div>
      <div className="num mt-0.5 truncate text-xs text-ink-3">
        {v.config.battery.seriesCells}s Li-ion + {v.config.supercap.capacitanceF} F SC
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </StoreProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cmd, setCmd] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line px-3 py-4 lg:flex">
        <Logo />
        <Nav />
        <ActiveVehicleCard />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setOpen(false)} />
          <div className="rise absolute inset-y-0 left-0 flex w-[280px] flex-col gap-6 border-r border-line bg-bg px-3 py-4 shadow-modal">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-surface-2"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            <Nav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] px-4 backdrop-blur-md sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <button
            onClick={() => setCmd(true)}
            className="ml-auto hidden h-8 w-64 items-center gap-2 rounded-sm border border-line bg-surface-1 px-2.5 text-sm text-ink-3 transition-colors hover:border-line-strong md:flex"
            aria-label="Search runs, cycles and models"
          >
            <Search className="size-3.5" aria-hidden />
            Search runs, cycles, models
            <kbd className="num ml-auto rounded-xs border border-line px-1 text-2xs text-ink-3">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button
              onClick={() => setCmd(true)}
              className="grid size-8 place-items-center rounded-sm text-ink-2 hover:bg-surface-2 md:hidden"
              aria-label="Search"
            >
              <Search className="size-4" />
            </button>
            <ThemeToggle />
            <AccountMenu />

          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <LoadError />
          {children}
        </main>
      </div>
    </div>
    <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </>
  );
}
