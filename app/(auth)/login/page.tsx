import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/guards";
import { hasConfiguredSessionSecret } from "@/lib/config/env";
import { listDemoAccounts } from "@/lib/services/auth-service";
import { DEMO_PASSWORD } from "@/lib/demo/fixtures/static-specs";

export const metadata = { title: "Sign in" };

/**
 * Sign-in page.
 *
 * The session read happens inside a Suspense boundary, as Cache Components
 * requires: the static shell renders immediately and the form streams in.
 */
export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await props.searchParams;
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={<LoginSkeleton />}>
        <LoginGate next={destination} />
      </Suspense>
    </main>
  );
}

async function LoginGate({ next }: { next: string }) {
  // Already signed in: go straight through rather than showing the form again.
  const current = await getCurrentUser();
  if (current) redirect(next);

  const demoAccounts = await listDemoAccounts();

  return (
    <LoginForm
      demoAccounts={demoAccounts}
      demoPassword={DEMO_PASSWORD}
      sessionSecretConfigured={hasConfiguredSessionSecret()}
      next={next}
    />
  );
}

function LoginSkeleton() {
  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="size-7" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
