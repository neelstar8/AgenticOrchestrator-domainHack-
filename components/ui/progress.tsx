"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils/cn";

export function Progress({
  value,
  className,
  tone = "accent",
  indeterminate = false,
  label,
}: {
  value: number;
  className?: string;
  tone?: "accent" | "verified" | "review" | "critical";
  indeterminate?: boolean;
  label?: string;
}) {
  const barTone =
    tone === "verified"
      ? "bg-verified"
      : tone === "review"
        ? "bg-review"
        : tone === "critical"
          ? "bg-critical"
          : "bg-accent";

  const clamped = Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      value={indeterminate ? undefined : clamped}
      aria-label={label}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-surface-hover",
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          barTone,
          indeterminate && "animate-pulse-soft",
        )}
        style={{ width: indeterminate ? "40%" : `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
