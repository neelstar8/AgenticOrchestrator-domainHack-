import * as React from "react";
import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const TONE_STYLES = {
  info: {
    container: "border-accent/30 bg-accent-subtle/60 text-accent-subtle-foreground",
    icon: Info,
  },
  verified: {
    container: "border-verified/30 bg-verified-subtle/60 text-verified-foreground",
    icon: CircleCheck,
  },
  review: {
    container: "border-review/35 bg-review-subtle/60 text-review-foreground",
    icon: AlertTriangle,
  },
  critical: {
    container: "border-critical/35 bg-critical-subtle/60 text-critical-foreground",
    icon: OctagonAlert,
  },
} as const;

export type AlertTone = keyof typeof TONE_STYLES;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  icon,
  role,
}: {
  tone?: AlertTone;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  role?: "alert" | "status" | "note";
}) {
  const style = TONE_STYLES[tone];
  const Icon = style.icon;

  return (
    <div
      role={role ?? (tone === "critical" ? "alert" : "status")}
      className={cn("rounded-lg border px-3.5 py-3 text-xs leading-relaxed", style.container, className)}
    >
      <div className="flex gap-2.5">
        <span className="mt-px shrink-0 [&_svg]:size-4" aria-hidden="true">
          {icon ?? <Icon />}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className="[&_a]:underline [&_a]:underline-offset-2">{children}</div>
          {action ? <div className="pt-1.5">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
