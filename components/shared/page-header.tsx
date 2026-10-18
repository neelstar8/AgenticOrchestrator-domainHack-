import * as React from "react";

import { cn } from "@/lib/utils/cn";

/** Standard page title block, used at the top of every dashboard page. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-xs leading-relaxed text-foreground-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </header>
  );
}

/** Label/value pair used throughout detail panels. */
export function DetailRow({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1 py-2 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4", className)}>
      <dt className="text-[11px] font-medium text-foreground-subtle">
        {label}
        {hint ? (
          <span className="mt-0.5 block text-[10px] font-normal leading-snug opacity-80">
            {hint}
          </span>
        ) : null}
      </dt>
      <dd className="min-w-0 break-words text-xs text-foreground">{children}</dd>
    </div>
  );
}

export function DetailList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn("divide-y divide-border", className)}>{children}</dl>;
}
