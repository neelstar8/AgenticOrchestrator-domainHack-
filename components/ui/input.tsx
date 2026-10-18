import * as React from "react";

import { cn } from "@/lib/utils/cn";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex h-9 w-full rounded-md border border-border bg-surface-sunken px-2.5 py-1.5 text-sm",
      "text-foreground placeholder:text-foreground-subtle transition-colors",
      "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-critical aria-invalid:outline-critical",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "flex min-h-20 w-full rounded-md border border-border bg-surface-sunken px-2.5 py-2 text-sm",
      "text-foreground placeholder:text-foreground-subtle transition-colors resize-y",
      "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-invalid:border-critical aria-invalid:outline-critical",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
