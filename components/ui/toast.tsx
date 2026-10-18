"use client";

import * as React from "react";
import { AlertTriangle, CircleCheck, Info, OctagonAlert, X } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Toast notifications.
 *
 * Deliberately lightweight: an announcer region plus a reducer, rather than a
 * dependency. Toasts here report the outcome of a real action ("scan started",
 * "7 domains updated, 1 skipped"), so they carry a title, a body and optional
 * detail — a bare "Success" would not be useful.
 */

export type ToastTone = "info" | "verified" | "review" | "critical";

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Extra lines, used for per-item outcomes in a bulk operation. */
  details?: string[];
  durationMs?: number;
}

type ToastInput = Omit<ToastMessage, "id">;

interface ToastContextValue {
  toasts: ToastMessage[];
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_CONFIG = {
  info: { icon: Info, className: "border-accent/35 bg-accent-subtle text-accent-subtle-foreground" },
  verified: {
    icon: CircleCheck,
    className: "border-verified/35 bg-verified-subtle text-verified-foreground",
  },
  review: {
    icon: AlertTriangle,
    className: "border-review/40 bg-review-subtle text-review-foreground",
  },
  critical: {
    icon: OctagonAlert,
    className: "border-critical/40 bg-critical-subtle text-critical-foreground",
  },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (toast: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      // A critical message stays until dismissed; it usually needs reading.
      const duration =
        toast.durationMs ?? (toast.tone === "critical" ? 0 : toast.tone === "review" ? 9000 : 6000);

      setToasts((current) => [...current.slice(-3), { ...toast, id }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = React.useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const context = React.use(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a <ToastProvider>.");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      // `polite` so a toast does not interrupt what a screen reader is saying.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const config = TONE_CONFIG[toast.tone];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex gap-2.5 rounded-lg border px-3.5 py-3 shadow-xl",
              "animate-slide-up backdrop-blur-sm",
              config.className,
            )}
          >
            <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="text-[11px] leading-relaxed opacity-90">{toast.description}</p>
              ) : null}
              {toast.details?.length ? (
                <ul className="space-y-0.5 pt-0.5 text-[11px] leading-relaxed opacity-80">
                  {toast.details.slice(0, 5).map((detail, index) => (
                    <li key={index} className="flex gap-1.5">
                      <span aria-hidden="true">·</span>
                      <span className="min-w-0 flex-1">{detail}</span>
                    </li>
                  ))}
                  {toast.details.length > 5 ? (
                    <li className="opacity-70">
                      …and {toast.details.length - 5} more.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="mt-px rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
            >
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Dismiss</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
