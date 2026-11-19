"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Accessible modal built on native <dialog>: focus trap, Esc to close, backdrop click to close. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dlg-title"
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-lg border border-line bg-surface-1 p-0 text-ink-1 shadow-modal backdrop:bg-[var(--overlay)] backdrop:backdrop-blur-[2px] open:animate-[rise_var(--dur-base)_var(--ease-out)]"
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h2 id="dlg-title" className="text-md font-medium">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
        </div>
        <button
          onClick={onClose}
          className="grid size-7 place-items-center rounded-sm text-ink-3 hover:bg-surface-2 hover:text-ink-1"
          aria-label="Close dialog"
        >
          <X className="size-4" />
        </button>
      </div>
      {children && <div className="px-5 pt-4">{children}</div>}
      {footer && <div className="mt-5 flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}
