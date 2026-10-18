import { Suspense } from "react";

import { NewScanDialog } from "@/components/scans/new-scan-dialog";
import { ScanHistoryTable } from "@/components/scans/scan-history-table";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { PageHeader } from "@/components/shared/page-header";
import { SkeletonTable } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";

export const metadata = { title: "Discovery Scans" };

export default function ScansPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Discovery scans"
        description="Every scan on record, with its agent task outcomes. Queued and Running only appear while a scan is genuinely in flight — a scan frozen in 'running' would misrepresent the state of the system, so none is seeded."
      />
      <Suspense fallback={<SkeletonTable rows={10} columns={11} />}>
        <ScansRegion />
      </Suspense>
    </div>
  );
}

async function ScansRegion() {
  const auth = await requirePermission("scans:read", "/scans");
  const config = getPublicConfig();
  const isSimulated = config.isDemoMode || config.usesSimulatedAgents;

  return (
    <div className="flex flex-col gap-4">
      {isSimulated ? <DemoSimulationNotice compact /> : null}
      <ScanHistoryTable
        newScanAction={
          auth.can("scans:create") ? (
            <NewScanDialog
              isSimulated={isSimulated}
              maxCandidatesLimit={config.limits.maxCandidatesPerScan}
            />
          ) : null
        }
      />
    </div>
  );
}
