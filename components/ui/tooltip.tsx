"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Tooltip.
 *
 * Used heavily in Sentinel to explain what a field, score or status actually
 * means — the explanations are part of the product, not decoration.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
  delayDuration = 200,
  asChild = true,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  delayDuration?: number;
  asChild?: boolean;
}) {
  if (content === null || content === undefined || content === "") {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild={asChild}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 max-w-xs rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5",
            "text-[11px] leading-relaxed text-foreground shadow-lg data-[state=delayed-open]:animate-fade-in",
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-surface-raised stroke-border-strong" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
