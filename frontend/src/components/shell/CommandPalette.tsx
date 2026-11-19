"use client";

import clsx from "clsx";
import { Activity, Car, CornerDownLeft, Route, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { controllerDef } from "@/lib/hess/registry";
import { NAV } from "@/lib/nav";
import { useStore } from "@/lib/store";

interface Item {
  id: string;
  group: string;
  label: string;
  meta?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { runs, cycles, vehicles } = useStore();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...NAV.flatMap((g) => g.items.map((i) => ({ id: i.href, group: "Pages", label: i.label, href: i.href, icon: i.icon }))),
      ...runs.slice(0, 50).map((r) => ({
        id: r.id,
        group: "Runs",
        label: `#${r.seq} · ${r.cycleName}`,
        meta: `${controllerDef(r.controller).label} · ${r.vehicleName}`,
        href: `/runs/${r.id}`,
        icon: Activity,
      })),
      ...cycles.map((c) => ({ id: c.id, group: "Drive cycles", label: c.name, meta: c.description, href: `/drive-cycles?c=${c.id}`, icon: Route })),
      ...vehicles.map((v) => ({ id: v.id, group: "Vehicles", label: v.name, meta: v.description, href: `/vehicles?v=${v.id}`, icon: Car })),
    ];
    const s = q.trim().toLowerCase();
    return s ? all.filter((i) => `${i.label} ${i.meta ?? ""} ${i.group}`.toLowerCase().includes(s)).slice(0, 30) : all.slice(0, 30);
  }, [q, runs, cycles, vehicles]);

  const go = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    router.push(i.href);
  };

  let lastGroup = "";
  return (
    <dialog
      ref={dlg}
      onClose={onClose}
      onClick={(e) => e.target === dlg.current && onClose()}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] rounded-lg border border-line bg-surface-1 p-0 text-ink-1 shadow-modal backdrop:bg-[var(--overlay)]"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="size-4 text-ink-3" aria-hidden />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
          }}
          placeholder="Search pages, runs, cycles, vehicles…"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
        />
        <kbd className="num rounded-xs border border-line px-1 text-2xs text-ink-3">Esc</kbd>
      </div>
      <ul id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-3">No matches for “{q}”.</li>}
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
          const Icon = it.icon;
          return (
            <li key={`${it.group}-${it.id}`} role="presentation">
              {header && <div className="px-2.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">{header}</div>}
              <div
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(it)}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 text-sm",
                  i === active ? "bg-surface-2 text-ink-1" : "text-ink-2",
                )}
              >
                <Icon className="size-4 shrink-0 text-ink-3" />
                <span className="truncate">{it.label}</span>
                {it.meta && <span className="truncate text-xs text-ink-3">{it.meta}</span>}
                {i === active && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-ink-3" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
