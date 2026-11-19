"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "good" | "warning" | "critical";
interface Toast { id: number; tone: Tone; title: string; body?: string }

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

const icons = { good: CheckCircle2, warning: AlertTriangle, critical: XCircle };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role="status" className="rise pointer-events-auto flex gap-3 rounded-md border border-line bg-surface-1 p-3 shadow-pop">
              <Icon
                className={clsx(
                  "mt-0.5 size-4 shrink-0",
                  t.tone === "good" && "text-good",
                  t.tone === "warning" && "text-warning",
                  t.tone === "critical" && "text-critical",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink-1">{t.title}</div>
                {t.body && <div className="mt-0.5 text-xs text-ink-2">{t.body}</div>}
              </div>
              <button
                onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
                className="grid size-6 place-items-center rounded-xs text-ink-3 hover:bg-surface-2"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
