import { Suspense } from "react";

import { RelationshipsClient } from "./relationships-client";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";

export const metadata = { title: "Domain Relationships" };

export default function RelationshipsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Domain relationships"
        description="Domains as nodes, observed and inferred relationships as edges. An edge records a correlation with a confidence score — it is never proof that two sites share an operator. Every edge states what it does not establish."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <GraphRegion />
      </Suspense>
    </div>
  );
}

async function GraphRegion() {
  await requirePermission("relationships:read", "/relationships");
  const config = getPublicConfig();

  return (
    <div className="flex flex-col gap-4">
      {config.isDemoMode ? <DemoSimulationNotice compact /> : null}
      <RelationshipsClient />
    </div>
  );
}
