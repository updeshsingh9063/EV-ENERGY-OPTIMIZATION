"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";

export function AccountMenu() {
  const { user, displayName, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const initials = (displayName || user.email || "?")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid size-8 place-items-center rounded-full bg-surface-3 text-xs font-medium text-ink-2 transition-colors hover:bg-line-strong hover:text-ink-1"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="rise absolute right-0 top-10 z-50 w-60 rounded-md border border-line bg-surface-1 p-1 shadow-pop">
          <div className="px-3 py-2.5">
            <div className="truncate text-sm font-medium text-ink-1">{displayName}</div>
            <div className="truncate text-xs text-ink-3">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink-1 disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden /> {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
