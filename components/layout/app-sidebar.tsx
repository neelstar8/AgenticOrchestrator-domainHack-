"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Globe,
  Landmark,
  LayoutDashboard,
  Radar,
  ScrollText,
  Settings,
  Share2,
  type LucideIcon,
} from "lucide-react";

import { SentinelLogo } from "@/components/shared/sentinel-logo";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { NAV_SECTIONS } from "@/lib/config/constants";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Radar,
  Globe,
  Share2,
  Landmark,
  FileText,
  ScrollText,
  Settings,
};

export interface SidebarCounts {
  domainsAwaitingReview: number;
  activeScans: number;
  reportsAwaitingReview: number;
}

/**
 * Primary navigation.
 *
 * Real `next/link` navigation throughout, so every section is a deep-linkable
 * URL that survives a refresh. Active state is derived from the pathname
 * rather than tracked in state, so it stays correct after a back-button
 * navigation.
 */
export function AppSidebar({
  counts,
  environmentLabel,
  isSimulated,
  onNavigate,
  className,
}: {
  counts: SidebarCounts;
  environmentLabel: string;
  isSimulated: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  const badgeFor = (href: string): number | null => {
    if (href === "/domains") return counts.domainsAwaitingReview || null;
    if (href === "/scans") return counts.activeScans || null;
    if (href === "/reports") return counts.reportsAwaitingReview || null;
    return null;
  };

  return (
    <div className={cn("flex h-full flex-col bg-panel", className)}>
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Link
          href="/overview"
          onClick={onNavigate}
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <SentinelLogo />
        </Link>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {NAV_SECTIONS.map((section) => {
            const Icon = ICONS[section.icon] ?? Globe;
            // `/domains/abc` should keep `/domains` highlighted.
            const isActive =
              pathname === section.href || pathname.startsWith(`${section.href}/`);
            const count = badgeFor(section.href);

            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium",
                    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                    "focus-visible:outline-ring",
                    isActive
                      ? "bg-accent-subtle text-accent-subtle-foreground"
                      : "text-foreground-muted hover:bg-surface-hover hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      isActive ? "text-accent" : "text-foreground-subtle group-hover:text-foreground-muted",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{section.label}</span>
                  {count !== null ? (
                    <Badge
                      tone={section.href === "/domains" ? "review" : "info"}
                      size="sm"
                      className="shrink-0"
                    >
                      {count > 99 ? "99+" : count}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <Tooltip
          content={
            isSimulated
              ? "Demo mode: agents are simulated and findings come from local fixtures. No external service is contacted."
              : "Live mode: configured providers are in use. Check the Settings page for which ones are actually configured."
          }
          side="right"
        >
          <div
            className={cn(
              "flex cursor-help items-center gap-2 rounded-md border px-2.5 py-2",
              isSimulated
                ? "border-accent/30 bg-accent-subtle/50"
                : "border-verified/30 bg-verified-subtle/50",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                isSimulated ? "bg-accent animate-pulse-soft" : "bg-verified",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isSimulated ? "text-accent-subtle-foreground" : "text-verified-foreground",
                )}
              >
                {environmentLabel}
              </p>
              <p className="truncate text-[10px] text-foreground-subtle">
                {isSimulated ? "Findings are simulated" : "Live providers configured"}
              </p>
            </div>
          </div>
        </Tooltip>
      </div>
    </div>
  );
}
