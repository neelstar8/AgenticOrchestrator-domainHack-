import { Suspense } from "react";
import { notFound } from "next/navigation";

import { DomainDetailView } from "@/components/domains/domain-detail-view";
import { PageHeader } from "@/components/shared/page-header";
import { SkeletonText, Skeleton } from "@/components/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getDomainDetail, listDomainFilterOptions } from "@/lib/services/domain-service";

export const metadata = { title: "Domain detail" };

export default async function DomainDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Domain detail"
        description="Observed facts, labelled evidence, inferred relationships and audit history are kept on separate tabs so an inference is never read as an observation."
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailRegion id={decodeURIComponent(id)} />
      </Suspense>
    </div>
  );
}

async function DetailRegion({ id }: { id: string }) {
  const auth = await requirePermission("domains:read", `/domains/${id}`);
  const [detail, options] = await Promise.all([
    getDomainDetail(auth, id),
    listDomainFilterOptions(auth),
  ]);

  if (!detail) notFound();

  return (
    <DomainDetailView
      detail={detail}
      reviewers={options.reviewers}
      canReview={auth.can("domains:review")}
      canExport={auth.can("domains:export")}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton className="h-5 w-56" />
        <div className="flex gap-2 pt-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <SkeletonText lines={10} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
