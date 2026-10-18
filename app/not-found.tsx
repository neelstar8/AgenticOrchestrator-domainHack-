import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SentinelLogo } from "@/components/shared/sentinel-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <SentinelLogo />
      <EmptyState
        icon={<FileQuestion />}
        title="That page does not exist"
        description="The address may be mistyped, or the record it pointed at may have been removed."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/overview">Go to the overview</Link>
          </Button>
        }
        className="max-w-lg"
      />
    </main>
  );
}
