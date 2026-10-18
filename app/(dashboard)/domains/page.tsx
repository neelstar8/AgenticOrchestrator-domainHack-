import { Suspense } from "react";

import { DomainRegistry } from "@/components/domains/domain-registry";
import { DemoSimulationNotice } from "@/components/shared/notices";
import { PageHeader } from "@/components/shared/page-header";
import { SkeletonTable } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getPublicConfig } from "@/lib/config/public-config";
import { listDomainFilterOptions } from "@/lib/services/domain-service";

export const metadata = { title: "Domain Registry" };

export default function DomainsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Domain registry"
        description="Every candidate domain discovered across all investigations. A domain in this registry is a candidate to verify — being listed here is not a finding about it. Fields showing 'Not checked' mean no check was attempted, which is not a negative result."
      />
      <Suspense fallback={<SkeletonTable rows={12} columns={10} />}>
        <RegistryRegion />
      </Suspense>
    </div>
  );
}

async function RegistryRegion() {
  const auth = await requirePermission("domains:read", "/domains");
  const options = await listDomainFilterOptions(auth);
  const config = getPublicConfig();

  return (
    <div className="flex flex-col gap-4">
      {config.isDemoMode ? <DemoSimulationNotice compact /> : null}
      <DomainRegistry
        options={options}
        canReview={auth.can("domains:review")}
        canExport={auth.can("domains:export")}
      />
    </div>
  );
}
