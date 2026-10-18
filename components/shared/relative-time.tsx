"use client";

import * as React from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime, formatRelativeTime } from "@/lib/utils/format";
import { NOT_CHECKED_LABEL } from "@/lib/utils/labels";

/**
 * Relative timestamp ("3 hours ago") with the exact UTC time on hover.
 *
 * The absolute time renders first and the relative form appears after mount.
 * That avoids a hydration mismatch — server and client clocks differ — and it
 * means a reader always has an exact, timezone-explicit value available, which
 * matters when a timestamp is evidence.
 */
export function RelativeTime({
  value,
  className,
  fallback = NOT_CHECKED_LABEL,
}: {
  value: string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!value) {
    return <span className={`italic text-foreground-subtle ${className ?? ""}`}>{fallback}</span>;
  }

  const absolute = formatDateTime(value);

  return (
    <Tooltip content={absolute}>
      <time dateTime={value} className={`cursor-help ${className ?? ""}`}>
        {now === null ? absolute : formatRelativeTime(value, now)}
      </time>
    </Tooltip>
  );
}
