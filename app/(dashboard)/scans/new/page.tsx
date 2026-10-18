import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewScanDialog } from "@/components/scans/new-scan-dialog";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";
import { AGENT_PURPOSES, AGENT_LABELS, DISCOVERY_SCOPE_DESCRIPTIONS, DISCOVERY_SCOPE_LABELS } from "@/lib/utils/labels";
import { AGENT_KEYS, DISCOVERY_SCOPES } from "@/lib/types/enums";

export const metadata = { title: "New scan" };

/**
 * Dedicated New Scan page.
 *
 * Shares the exact same form component as the dialog, so the two can never
 * drift. This page additionally documents what each scope and each agent
 * actually does, which is the part most worth reading before running a scan.
 */
export default function NewScanPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="New discovery scan"
        description="Discovery produces candidates to verify. Nothing a scan returns is a finding about any website, and a candidate that was never checked stays explicitly marked as unchecked."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/scans">
              <ArrowLeft aria-hidden="true" />
              Back to scan history
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-10 w-48" />}>
        <StartRegion />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What each discovery scope does</CardTitle>
            <CardDescription>
              Scopes are opt-in. A profile can narrow your selection but never adds one you did not
              choose.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              {DISCOVERY_SCOPES.map((scope) => (
                <div key={scope} className="py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-xs font-medium text-foreground">
                    {DISCOVERY_SCOPE_LABELS[scope]}
                  </dt>
                  <dd className="pt-1 text-[11px] leading-relaxed text-foreground-muted">
                    {DISCOVERY_SCOPE_DESCRIPTIONS[scope]}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>The six agents</CardTitle>
            <CardDescription>
              The pipeline is explicit and bounded. Each agent runs once, in this order, with
              validated input and output — it is not an autonomous loop.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border">
              {AGENT_KEYS.map((agentKey, index) => (
                <li key={agentKey} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-xs font-medium text-foreground">
                    {index + 1}. {AGENT_LABELS[agentKey]}
                  </p>
                  <p className="pt-1 text-[11px] leading-relaxed text-foreground-muted">
                    {AGENT_PURPOSES[agentKey]}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function StartRegion() {
  const auth = await requirePermission("scans:create", "/scans/new");
  const config = getPublicConfig();
  const isSimulated = config.isDemoMode || config.usesSimulatedAgents;

  return (
    <div className="flex flex-col gap-4">
      {isSimulated ? <DemoSimulationNotice /> : null}
      <div>
        <NewScanDialog
          isSimulated={isSimulated}
          maxCandidatesLimit={config.limits.maxCandidatesPerScan}
        />
      </div>
      <p className="text-[11px] text-foreground-subtle">
        Signed in as {auth.user.name}. The scan will be recorded against your name in the audit
        log.
      </p>
    </div>
  );
}
