import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { KpiCards } from "@/components/dashboard/kpi-cards";
import { OverviewCharts } from "@/components/dashboard/overview-charts";
import { OverviewSidePanels, RecentDiscoveries } from "@/components/dashboard/recent-panels";
import { NewScanDialog } from "@/components/scans/new-scan-dialog";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonChart, SkeletonTable } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";
import { getRepository } from "@/lib/repositories";
import type { ScanProfile } from "@/lib/types/enums";

export const metadata = { title: "Overview" };

/**
 * Overview dashboard.
 *
 * The header is static shell; every data region streams in behind its own
 * Suspense boundary, which is both what Cache Components requires and what
 * makes the page usable before the heavier aggregations finish.
 */
export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<HeaderFallback />}>
        <OverviewHeader />
      </Suspense>

      <Suspense fallback={<MetricsFallback />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

async function OverviewHeader() {
  await requirePermission("domains:read", "/overview");
  const config = getPublicConfig();
  const repository = await getRepository();
  const settings = await repository.listSettings();

  const defaultProfile =
    (settings.find((setting) => setting.key === "agents.defaultProfile")?.value as ScanProfile) ??
    "QUICK";
  const defaultMaxCandidates = Number(
    settings.find((setting) => setting.key === "scanLimits.maxCandidatesDefault")?.value ?? 50,
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description="Discovery, triage and reporting activity across every investigation. Every figure on this page is computed from the records in the registry — click any of them to see the rows behind it."
        actions={
          <>
            <NewScanDialog
              isSimulated={config.isDemoMode || config.usesSimulatedAgents}
              maxCandidatesLimit={config.limits.maxCandidatesPerScan}
              defaultProfile={defaultProfile}
              defaultMaxCandidates={defaultMaxCandidates}
            />
            <Button asChild variant="secondary" size="sm">
              <Link href="/domains">
                View all domains
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />
      {config.isDemoMode || config.usesSimulatedAgents ? <DemoSimulationNotice /> : null}
    </>
  );
}

async function OverviewContent() {
  await requirePermission("domains:read", "/overview");
  const repository = await getRepository();
  const metrics = await repository.getOverviewMetrics();

  return (
    <div className="flex flex-col gap-5">
      <KpiCards metrics={metrics} />
      <OverviewCharts metrics={metrics} />
      <RecentDiscoveries metrics={metrics} />
      <OverviewSidePanels metrics={metrics} />
    </div>
  );
}

function HeaderFallback() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-6 w-32 animate-pulse-soft rounded bg-surface-hover" />
      <div className="h-3 w-full max-w-2xl animate-pulse-soft rounded bg-surface-hover" />
    </div>
  );
}

function MetricsFallback() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="h-3 w-40 animate-pulse-soft rounded bg-surface-hover" />
            </CardHeader>
            <CardContent className="h-64">
              <SkeletonChart />
            </CardContent>
          </Card>
        ))}
      </div>
      <SkeletonTable rows={8} columns={9} />
    </div>
  );
}
