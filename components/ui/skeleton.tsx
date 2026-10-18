import { cn } from "@/lib/utils/cn";

/**
 * Loading placeholder.
 *
 * Skeletons mirror the shape of the content they stand in for, so a page does
 * not jump when real data arrives.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse-soft rounded-md bg-surface-hover", className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className="h-3"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

/** Table skeleton matching the real table's row height and column count. */
export function SkeletonTable({
  rows = 8,
  columns = 6,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
      role="status"
      aria-label="Loading table data"
    >
      <div className="flex items-center gap-4 border-b border-border bg-surface-sunken px-4 py-2.5">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className="h-3 flex-1"
              style={{ opacity: 1 - rowIndex * 0.06 }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-3 h-2.5 w-32" />
    </div>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-48 items-end gap-1.5 px-1", className)}>
      {Array.from({ length: 24 }, (_, index) => (
        <Skeleton
          key={index}
          className="flex-1"
          style={{ height: `${28 + Math.abs(Math.sin(index * 0.7)) * 62}%` }}
        />
      ))}
    </div>
  );
}
