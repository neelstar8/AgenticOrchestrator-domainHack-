"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, FlaskConical, LogOut, Menu, Radio, ShieldAlert, TriangleAlert, UserRound } from "lucide-react";

import { Breadcrumbs } from "./breadcrumbs";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";
import { AppSidebar, type SidebarCounts } from "./app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { RoleBadge } from "@/components/shared/badges";
import { RelativeTime } from "@/components/shared/relative-time";
import { cn } from "@/lib/utils/cn";
import type { Role } from "@/lib/types/enums";
import type { ScanListItem } from "@/lib/types/views";
import { SCAN_STATUS_LABELS } from "@/lib/utils/labels";

export interface HeaderUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  isDemoUser: boolean;
}

/**
 * Application header.
 *
 * Carries the breadcrumbs, global search, the environment indicator, live task
 * status and the user menu. The environment indicator and the development-session
 * warning are not decoration: a viewer must be able to tell at a glance whether
 * what they are looking at is simulated, and whether the session they are in is
 * production-secure.
 */
export function AppHeader({
  user,
  counts,
  activeScans,
  isSimulated,
  environmentLabel,
  isDevelopmentSession,
  currentLabel,
}: {
  user: HeaderUser;
  counts: SidebarCounts;
  activeScans: ScanListItem[];
  isSimulated: boolean;
  environmentLabel: string;
  isDevelopmentSession: boolean;
  currentLabel?: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
      push({
        tone: "critical",
        title: "Could not sign out",
        description: "The request failed. Check your connection and try again.",
      });
    }
  };

  const notificationCount =
    activeScans.length + counts.domainsAwaitingReview + counts.reportsAwaitingReview;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-md sm:px-4">
      {/* Mobile navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" width="sm" className="p-0">
          <AppSidebar
            counts={counts}
            environmentLabel={environmentLabel}
            isSimulated={isSimulated}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <Breadcrumbs currentLabel={currentLabel} />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Environment indicator */}
        <Tooltip
          content={
            isSimulated
              ? "Demo mode. Agents are simulated and every finding comes from local fixtures. Nothing contacts an external service."
              : "Live mode. See Settings for exactly which providers are configured."
          }
        >
          <Badge
            tone={isSimulated ? "info" : "verified"}
            className="hidden cursor-help items-center sm:inline-flex"
          >
            {isSimulated ? <FlaskConical className="size-2.5" aria-hidden="true" /> : null}
            {environmentLabel}
          </Badge>
        </Tooltip>

        {/* Development-session warning: never let a demo session look production-secure. */}
        {isDevelopmentSession ? (
          <Tooltip content="SESSION_SECRET is not configured, so sessions use an ephemeral development secret and will not survive a restart. This is NOT production-secure authentication. See docs/security-checklist.md.">
            <Badge tone="review" className="hidden cursor-help items-center md:inline-flex">
              <ShieldAlert className="size-2.5" aria-hidden="true" />
              Dev session
            </Badge>
          </Tooltip>
        ) : null}

        <GlobalSearch />

        {/* Task status / notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ""}`}
            >
              <Bell aria-hidden="true" />
              {activeScans.length > 0 ? (
                <span
                  className="absolute right-1 top-1 size-1.5 animate-pulse-soft rounded-full bg-accent"
                  aria-hidden="true"
                />
              ) : notificationCount > 0 ? (
                <span
                  className="absolute right-1 top-1 size-1.5 rounded-full bg-review"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0">
            <div className="border-b border-border px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">Task status</p>
              <p className="text-[11px] text-foreground-muted">
                Live scan activity and what is waiting on a person.
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {activeScans.length > 0 ? (
                <section className="border-b border-border px-3 py-2.5">
                  <h4 className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Running now
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {activeScans.map((scan) => (
                      <li key={scan.id}>
                        <Link
                          href={`/scans/${scan.id}`}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-hover"
                        >
                          <Radio
                            className="size-3 shrink-0 animate-pulse-soft text-accent"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[11px] text-foreground">
                              {scan.reference}
                            </span>
                            <span className="block truncate text-[10px] text-foreground-subtle">
                              {scan.platformNameInput} ·{" "}
                              {scan.taskCounts.completed}/{scan.taskCounts.total} tasks ·{" "}
                              {SCAN_STATUS_LABELS[scan.status]}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="px-3 py-2.5">
                <h4 className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Waiting on a person
                </h4>
                <ul className="flex flex-col gap-1">
                  <NotificationRow
                    href="/domains?reviewStatus=AWAITING_REVIEW"
                    label="Domains awaiting review"
                    count={counts.domainsAwaitingReview}
                    tone="review"
                  />
                  <NotificationRow
                    href="/reports?status=AWAITING_REVIEW"
                    label="Reports awaiting review"
                    count={counts.reportsAwaitingReview}
                    tone="review"
                  />
                </ul>
                {notificationCount === 0 ? (
                  <p className="px-1.5 py-2 text-[11px] text-foreground-subtle">
                    Nothing is waiting. No scans are running and every candidate has been triaged.
                  </p>
                ) : null}
              </section>
            </div>
          </PopoverContent>
        </Popover>

        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Account: ${user.name}`}>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border border-border",
                  "bg-accent-subtle text-[10px] font-semibold text-accent-subtle-foreground",
                )}
                aria-hidden="true"
              >
                {initials(user.name)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="px-2 py-2">
              <p className="truncate text-xs font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-[11px] text-foreground-muted">{user.email}</p>
              {user.jobTitle ? (
                <p className="truncate pt-0.5 text-[10px] text-foreground-subtle">
                  {user.jobTitle}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1 pt-2">
                <RoleBadge role={user.role} />
                {user.isDemoUser ? <Badge tone="info">Demo account</Badge> : null}
              </div>
            </div>

            <DropdownMenuSeparator />

            {isDevelopmentSession ? (
              <>
                <div className="flex gap-2 px-2 py-2 text-[10px] leading-relaxed text-review-foreground">
                  <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden="true" />
                  <span>
                    Development session. SESSION_SECRET is not configured, so this is not
                    production-secure authentication.
                  </span>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserRound aria-hidden="true" />
                Settings and providers
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/audit-log?actorId=${user.id}`}>
                <Bell aria-hidden="true" />
                My audit history
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()} disabled={signingOut}>
              <LogOut aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function NotificationRow({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  tone: "review" | "info";
}) {
  if (count === 0) return null;

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-hover"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground-muted">{label}</span>
        <Badge tone={tone} size="sm">
          {count}
        </Badge>
      </Link>
    </li>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
