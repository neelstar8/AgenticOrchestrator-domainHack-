import * as React from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Empty state.
 *
 * An empty state should explain WHY there is nothing here and what to do
 * about it — "No domains match these filters" is useful; "No data" is not.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  tone?: "neutral" | "review" | "critical";
}) {
  const ringTone =
    tone === "critical"
      ? "border-critical/30 bg-critical-subtle text-critical"
      : tone === "review"
        ? "border-review/30 bg-review-subtle text-review-foreground"
        : "border-border bg-surface-raised text-foreground-subtle";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed",
        "border-border bg-surface-sunken/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-lg border [&_svg]:size-5",
            ringTone,
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-foreground-muted">{description}</p>
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
