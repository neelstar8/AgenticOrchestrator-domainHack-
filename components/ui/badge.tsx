import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";
import type { Tone } from "@/lib/utils/labels";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium " +
    "leading-tight whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-surface-raised text-foreground",
        info: "border-accent/35 bg-accent-subtle text-accent-subtle-foreground",
        verified: "border-verified/35 bg-verified-subtle text-verified-foreground",
        review: "border-review/40 bg-review-subtle text-review-foreground",
        critical: "border-critical/40 bg-critical-subtle text-critical-foreground",
        muted: "border-border bg-muted-subtle text-muted-foreground",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-1.5 py-0.5 text-[11px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    Omit<VariantProps<typeof badgeVariants>, "tone"> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export { badgeVariants };
