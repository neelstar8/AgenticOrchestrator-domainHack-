import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils/cn";

/**
 * Investigative table primitives.
 *
 * Dense by default — these tables are read in bulk — but with enough row
 * height and contrast to stay legible. The wrapper owns horizontal scrolling,
 * so a wide table never makes the page body scroll sideways.
 */

export function TableWrapper({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "scroll-x rounded-lg border border-border bg-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full caption-bottom border-collapse text-left text-xs", className)}
      {...props}
    />
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-border bg-surface-sunken/80", className)}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({
  className,
  interactive = false,
  selected = false,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  interactive?: boolean;
  selected?: boolean;
}) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "border-b border-border transition-colors",
        interactive && "cursor-pointer hover:bg-surface-hover/70",
        selected && "bg-accent-subtle/40",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  align = "left",
  ...props
}: Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  align = "left",
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-foreground-muted",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={cn("px-3 py-2 text-left text-[11px] text-foreground-subtle", className)} {...props} />
  );
}

/**
 * Sortable column header.
 *
 * Renders as a button and announces the current sort through aria-sort, so a
 * screen-reader user can tell which column is ordering the table.
 */
export function SortableHead({
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className,
  hint,
}: {
  label: string;
  columnKey: string;
  activeKey: string | undefined;
  direction: "asc" | "desc" | undefined;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
  hint?: string;
}) {
  const isActive = activeKey === columnKey;
  const Icon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      align={align}
      className={cn("p-0", className)}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        title={hint}
        className={cn(
          "flex w-full items-center gap-1 px-3 py-2 text-[10px] font-semibold uppercase",
          "tracking-wide transition-colors hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
          isActive ? "text-foreground" : "text-foreground-subtle",
          align === "right" && "justify-end",
          align === "center" && "justify-center",
        )}
      >
        <span>{label}</span>
        <Icon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

/** Numeric/identifier cell in the monospace face, for scanning columns. */
export function MonoCell({
  className,
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <TableCell
      className={cn("font-mono text-[11px] text-foreground", className)}
      {...props}
    />
  );
}
