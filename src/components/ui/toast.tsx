"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Hand-rolled rather than a dependency — no toast primitive exists among the
 * installed Radix packages, and this app already prefers a small fixed-
 * purpose component over a new runtime (see `components/domain/charts.tsx`).
 */

interface ToastOptions {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss. Default 5000; B3's accept-undo toast passes 6000. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      const duration = opts.duration ?? 5000;
      setToasts((prev) => [...prev, { id, ...opts }]);
      window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Polite so a toast announces without interrupting whatever the
          screen reader is already reading — satisfies both this and the
          general "announce toasts" requirement. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="panel-glow pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line-strong bg-overlay p-3"
          >
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-body font-medium text-ink">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-meta text-muted">{t.description}</p>
              )}
            </div>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
                className="min-h-[36px] shrink-0 rounded-md px-2 text-meta font-medium text-accent transition-colors hover:bg-hover"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
