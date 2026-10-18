"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils/cn";

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-xs font-medium text-foreground-muted peer-disabled:opacity-60",
      className,
    )}
    {...props}
  >
    {children}
    {required ? (
      <span className="ml-0.5 text-critical" aria-hidden="true">
        *
      </span>
    ) : null}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";

/** Field wrapper handling label, hint, error and aria wiring in one place. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {hint ? (
        <p id={hintId} className="text-[11px] leading-relaxed text-foreground-subtle">
          {hint}
        </p>
      ) : null}
      <div aria-describedby={cn(hintId, errorId) || undefined}>{children}</div>
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
