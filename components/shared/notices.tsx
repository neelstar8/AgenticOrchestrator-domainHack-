import { FlaskConical } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import {
  ABSENCE_IS_NOT_AUTHORISATION_NOTICE,
  SHARED_INFRASTRUCTURE_NOTICE,
  SIGNAL_NOT_DETERMINATION_NOTICE,
  SIMULATION_NOTICE,
} from "@/lib/config/constants";

/**
 * Standing notices.
 *
 * Centralised so the wording is identical everywhere it appears and cannot
 * drift into something weaker. Each one exists because the corresponding
 * misreading is the obvious one for a reader to make.
 */

/** Shown wherever simulated findings are displayed. */
export function DemoSimulationNotice({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <p
        className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-foreground-subtle ${className ?? ""}`}
      >
        <FlaskConical className="mt-px size-3 shrink-0" aria-hidden="true" />
        <span>{SIMULATION_NOTICE}</span>
      </p>
    );
  }

  return (
    <Alert
      tone="info"
      title="Demo simulation"
      icon={<FlaskConical />}
      className={className}
      role="note"
    >
      {SIMULATION_NOTICE}
    </Alert>
  );
}

/** Shown next to similarity scores and model-derived analysis. */
export function SignalNotDeterminationNotice({ className }: { className?: string }) {
  return (
    <Alert tone="review" title="These are signals, not findings" className={className} role="note">
      {SIGNAL_NOT_DETERMINATION_NOTICE}
    </Alert>
  );
}

/** Shown on the regulatory sources page and in match views. */
export function AbsenceNotAuthorisationNotice({ className }: { className?: string }) {
  return (
    <Alert
      tone="review"
      title="A non-match is not authorisation"
      className={className}
      role="note"
    >
      {ABSENCE_IS_NOT_AUTHORISATION_NOTICE}
    </Alert>
  );
}

/** Shown on the relationship graph and certificate panels. */
export function SharedInfrastructureNotice({ className }: { className?: string }) {
  return (
    <Alert
      tone="review"
      title="Shared infrastructure is not shared ownership"
      className={className}
      role="note"
    >
      {SHARED_INFRASTRUCTURE_NOTICE}
    </Alert>
  );
}

/** Shown on the audit log, so the integrity claim is not overstated. */
export function AuditIntegrityNotice({ className }: { className?: string }) {
  return (
    <Alert tone="info" title="How append-only is enforced" className={className} role="note">
      Audit events are append-only by design: the repository interface exposes no update or delete
      operation, and the PostgreSQL migration adds a trigger that rejects UPDATE and DELETE on the
      table. This is <strong>not</strong> cryptographic tamper-proofing — a database superuser
      could still alter history, and Sentinel makes no claim otherwise.
    </Alert>
  );
}

/** Shown wherever a report's submission state is displayed. */
export function SubmissionIsManualNotice({ className }: { className?: string }) {
  return (
    <Alert tone="info" title="Sentinel does not send reports" className={className} role="note">
      A report marked <strong>Submitted</strong> means a person recorded that they submitted it out
      of band and entered the reference by hand. Sentinel never transmits a report to any
      authority, and it cannot block a domain or cause any domain to be blocked.
    </Alert>
  );
}
