import { Suspense } from "react";

import { AppHeader, type HeaderUser } from "@/components/layout/app-header";
import { AppSidebar, type SidebarCounts } from "@/components/layout/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";
import { getRepository } from "@/lib/repositories";
import type { ScanListItem } from "@/lib/types/views";

/**
 * Dashboard shell.
 *
 * With Cache Components enabled, the session read cannot sit at the top level
 * of a layout: awaiting it there would hold `{children}` behind the request.
 * The chrome therefore renders as a static shell and the authenticated parts —
 * sidebar counts, header, user menu — stream in behind their own Suspense
 * boundaries.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="hidden w-60 shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-dvh">
          <Suspense fallback={<SidebarSkeleton />}>
            <SidebarRegion />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<HeaderSkeleton />}>
          <HeaderRegion />
        </Suspense>

        <main id="main-content" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>

        <footer className="border-t border-border px-4 py-3 text-center text-[10px] leading-relaxed text-foreground-subtle">
          Sentinel presents investigative signals, not legal determinations. Similarity scores,
          discovery sources and model-generated analysis are not findings of fraud, illegality or
          lack of authorisation.
        </footer>
      </div>
    </div>
  );
}

/** Loads the counts and configuration both the sidebar and header need. */
async function loadShellData(): Promise<{
  user: HeaderUser;
  counts: SidebarCounts;
  activeScans: ScanListItem[];
  isSimulated: boolean;
  environmentLabel: string;
  isDevelopmentSession: boolean;
}> {
  const current = await requireUser();
  const config = getPublicConfig();
  const repository = await getRepository();

  const [awaitingDomains, activeScans, awaitingReports] = await Promise.all([
    repository.listDomains({
      reviewStatus: ["AWAITING_REVIEW", "UNDER_REVIEW", "NEEDS_MORE_EVIDENCE"],
      pageSize: 1,
    }),
    repository.listScans({ status: ["RUNNING", "QUEUED"], pageSize: 5 }),
    repository.listReports({ status: ["AWAITING_REVIEW"], pageSize: 1 }),
  ]);

  return {
    user: {
      id: current.user.id,
      name: current.user.name,
      email: current.user.email,
      role: current.user.role,
      jobTitle: current.user.jobTitle,
      isDemoUser: current.user.isDemoUser,
    },
    counts: {
      domainsAwaitingReview: awaitingDomains.total,
      activeScans: activeScans.total,
      reportsAwaitingReview: awaitingReports.total,
    },
    activeScans: activeScans.items,
    isSimulated: config.isDemoMode || config.usesSimulatedAgents,
    environmentLabel: config.isDemoMode ? "Demo mode" : "Live mode",
    isDevelopmentSession: !config.sessionSecretConfigured,
  };
}

async function SidebarRegion() {
  const shell = await loadShellData();
  return (
    <AppSidebar
      counts={shell.counts}
      environmentLabel={shell.environmentLabel}
      isSimulated={shell.isSimulated}
    />
  );
}

async function HeaderRegion() {
  const shell = await loadShellData();
  return (
    <AppHeader
      user={shell.user}
      counts={shell.counts}
      activeScans={shell.activeScans}
      isSimulated={shell.isSimulated}
      environmentLabel={shell.environmentLabel}
      isDevelopmentSession={shell.isDevelopmentSession}
    />
  );
}

function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Skeleton className="size-7 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-1 px-2 py-3">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <Skeleton className="h-3 w-40" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md sm:w-64" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="size-7 rounded-full" />
      </div>
    </div>
  );
}
