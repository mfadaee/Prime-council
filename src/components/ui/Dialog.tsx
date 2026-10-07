"use client";

import { useEffect, useRef } from "react";

/** Accessible modal built on <dialog> (focus trap, Esc to close, inert background). */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
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
      aria-labelledby="dialog-title"
      className={`m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-line-strong bg-panel-solid p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-3 flex items-start gap-3">
            <h2 id="dialog-title" className="font-display text-lg font-bold">
              {title}
            </h2>
            <button type="button" className="btn btn-sm ml-auto" onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
