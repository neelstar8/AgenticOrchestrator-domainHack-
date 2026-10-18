import { Suspense } from "react";

import { RegulatorySourcesView } from "@/components/regulatory/regulatory-sources-view";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";
import { listRegulatorySources } from "@/lib/services/regulatory-service";

export const metadata = { title: "Regulatory Sources" };

export default function RegulatorySourcesPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Regulatory sources"
        description="The official publications this deployment is configured to check against, kept structurally separate from the simulated fixtures used to demonstrate the matching workflow. Sentinel never fabricates an official warning."
      />
      <Suspense fallback={<SourcesSkeleton />}>
        <SourcesRegion />
      </Suspense>
    </div>
  );
}

async function SourcesRegion() {
  const auth = await requirePermission("regulatorySources:read", "/regulatory-sources");
  const { configuredRealSources, simulatedFixtureSources } = await listRegulatorySources(auth);
  const config = getPublicConfig();

  return (
    <RegulatorySourcesView
      realSources={configuredRealSources}
      fixtureSources={simulatedFixtureSources}
      canManage={auth.can("regulatorySources:manage")}
      canCheck={auth.can("regulatorySources:check")}
      liveFetchEnabled={config.liveFetchEnabled}
    />
  );
}

function SourcesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-4 w-56" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-44 w-full rounded-lg" />
      ))}
    </div>
  );
}
