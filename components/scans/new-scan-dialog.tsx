"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Play, Plus } from "lucide-react";

import { ScanProgressPanel } from "./scan-progress-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { DISCOVERY_SCOPES, SCAN_PROFILES } from "@/lib/types/enums";
import type { DiscoveryScope, ScanProfile } from "@/lib/types/enums";
import {
  DISCOVERY_SCOPE_DESCRIPTIONS,
  DISCOVERY_SCOPE_LABELS,
  SCAN_PROFILE_DESCRIPTIONS,
  SCAN_PROFILE_LABELS,
} from "@/lib/utils/labels";
import { createScanSchema } from "@/lib/validation/schemas";
import type { Scan } from "@/lib/types/models";

/**
 * New scan workflow.
 *
 * Creates a real scan, then shows live progress read from application state —
 * not a canned animation. The "Demo simulation" banner is present from the
 * first moment and stays through the result, because a reader should never
 * have to work out whether what they are watching is real.
 */

const DEFAULT_SCOPES: DiscoveryScope[] = [
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
];

/** Scopes a Quick profile actually runs, mirroring the service's filter. */
const QUICK_SCOPES: ReadonlySet<DiscoveryScope> = new Set([
  "SEARCH_INDEX",
  "DOMAIN_VARIATIONS",
  "TECHNICAL_INSPECTION",
  "REGULATORY_MATCHING",
]);

export function NewScanDialog({
  isSimulated,
  maxCandidatesLimit,
  defaultProfile = "QUICK",
  defaultMaxCandidates = 50,
  trigger,
}: {
  isSimulated: boolean;
  maxCandidatesLimit: number;
  defaultProfile?: ScanProfile;
  defaultMaxCandidates?: number;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { push } = useToast();

  const [open, setOpen] = React.useState(false);
  const [platformName, setPlatformName] = React.useState("");
  const [seedDomain, setSeedDomain] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [scopes, setScopes] = React.useState<DiscoveryScope[]>(DEFAULT_SCOPES);
  const [profile, setProfile] = React.useState<ScanProfile>(defaultProfile);
  const [maxCandidates, setMaxCandidates] = React.useState(String(defaultMaxCandidates));

  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [startedScan, setStartedScan] = React.useState<Scan | null>(null);

  const reset = () => {
    setPlatformName("");
    setSeedDomain("");
    setNotes("");
    setScopes(DEFAULT_SCOPES);
    setProfile(defaultProfile);
    setMaxCandidates(String(defaultMaxCandidates));
    setErrors({});
    setFormError(null);
    setStartedScan(null);
    setSubmitting(false);
  };

  const toggleScope = (scope: DiscoveryScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
    setErrors((current) => {
      const { scopes: _removed, ...rest } = current;
      return rest;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = createScanSchema.safeParse({
      platformName,
      seedDomain,
      notes,
      scopes,
      maxCandidates,
      profile,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".") || "_root";
        next[key] ??= issue.message;
      }
      setErrors(next);
      if (next._root) setFormError(next._root);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setFormError(extractMessage(payload) ?? "The scan could not be started.");
        setSubmitting(false);
        return;
      }

      const data = (payload as { data: { scan: Scan; taskCount: number } }).data;
      setStartedScan(data.scan);
      setSubmitting(false);

      push({
        tone: "info",
        title: isSimulated ? "Demo simulation started" : "Scan started",
        description: `${data.scan.reference} is running ${data.taskCount} agent task(s).`,
      });

      // Refresh so the sidebar counts and overview reflect the new scan.
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check that it is running and try again.");
      setSubmitting(false);
    }
  };

  const effectiveScopes =
    profile === "QUICK" ? scopes.filter((scope) => QUICK_SCOPES.has(scope)) : scopes;
  const droppedByProfile = scopes.filter((scope) => !effectiveScopes.includes(scope));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="primary" size="sm">
            <Plus aria-hidden="true" />
            New scan
          </Button>
        )}
      </DialogTrigger>

      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {startedScan ? "Scan in progress" : "New discovery scan"}
            {isSimulated ? (
              <Badge tone="info">
                <FlaskConical className="size-2.5" aria-hidden="true" />
                Demo simulation
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {startedScan
              ? `${startedScan.reference} — progress below is read from live application state.`
              : "Discovery finds candidates to verify. Nothing a scan returns is a finding about any website."}
          </DialogDescription>
        </DialogHeader>

        {startedScan ? (
          <>
            <DialogBody>
              <ScanProgressPanel
                scanId={startedScan.id}
                reference={startedScan.reference}
                onComplete={() => router.refresh()}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  router.push(`/scans/${startedScan.id}`);
                }}
              >
                Open full scan detail
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="flex flex-col gap-5">
              {isSimulated ? (
                <Alert tone="info" title="This will be a demo simulation" icon={<FlaskConical />}>
                  Agents run against local synthetic fixtures. No search engine, DNS resolver,
                  website, language model or regulator is contacted. Results are labelled{" "}
                  <strong>Simulated demo data</strong> everywhere they appear.
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Platform or brand name"
                  htmlFor="platformName"
                  required
                  error={errors.platformName ?? null}
                  hint="The brand being investigated, as an operator would write it."
                >
                  <Input
                    id="platformName"
                    value={platformName}
                    onChange={(event) => setPlatformName(event.target.value)}
                    placeholder="Quotex"
                    invalid={Boolean(errors.platformName)}
                    autoFocus
                  />
                </Field>

                <Field
                  label="Seed domain"
                  htmlFor="seedDomain"
                  error={errors.seedDomain ?? null}
                  hint="Optional when search-index discovery is selected. A hostname or full URL."
                >
                  <Input
                    id="seedDomain"
                    value={seedDomain}
                    onChange={(event) => setSeedDomain(event.target.value)}
                    placeholder="quotex.com"
                    invalid={Boolean(errors.seedDomain)}
                  />
                </Field>
              </div>

              <Field
                label="Investigation notes"
                htmlFor="notes"
                error={errors.notes ?? null}
                hint="Recorded against the scan and shown in the audit trail. Optional."
              >
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Why this scan is being run, and anything a later reader should know."
                  rows={2}
                />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="pb-1 text-xs font-medium text-foreground-muted">
                  Discovery scope
                  <span className="ml-0.5 text-critical" aria-hidden="true">
                    *
                  </span>
                </legend>
                {errors.scopes ? (
                  <p role="alert" className="text-[11px] font-medium text-critical">
                    {errors.scopes}
                  </p>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  {DISCOVERY_SCOPES.map((scope) => {
                    const checked = scopes.includes(scope);
                    const droppedForProfile = checked && !effectiveScopes.includes(scope);

                    return (
                      <label
                        key={scope}
                        className={cn(
                          "flex cursor-pointer gap-2.5 rounded-md border p-2.5 transition-colors",
                          checked
                            ? "border-accent/50 bg-accent-subtle/25"
                            : "border-border bg-surface-sunken/50 hover:border-border-strong",
                          droppedForProfile && "opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleScope(scope)}
                          className="mt-0.5"
                          aria-describedby={`${scope}-description`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">
                              {DISCOVERY_SCOPE_LABELS[scope]}
                            </span>
                            {droppedForProfile ? (
                              <Badge tone="muted" size="sm">
                                Not in Quick
                              </Badge>
                            ) : null}
                          </span>
                          {/* Each scope explains exactly what it does, including
                              what it does NOT establish. */}
                          <span
                            id={`${scope}-description`}
                            className="mt-1 block text-[10px] leading-relaxed text-foreground-subtle"
                          >
                            {DISCOVERY_SCOPE_DESCRIPTIONS[scope]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Scan profile"
                  htmlFor="profile"
                  required
                  hint={SCAN_PROFILE_DESCRIPTIONS[profile]}
                >
                  <Select
                    value={profile}
                    onValueChange={(value) => setProfile(value as ScanProfile)}
                  >
                    <SelectTrigger id="profile">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCAN_PROFILES.map((option) => (
                        <SelectItem
                          key={option}
                          value={option}
                          description={SCAN_PROFILE_DESCRIPTIONS[option]}
                        >
                          {SCAN_PROFILE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Maximum candidate domains"
                  htmlFor="maxCandidates"
                  required
                  error={errors.maxCandidates ?? null}
                  hint={`Capped at ${maxCandidatesLimit} by SENTINEL_MAX_CANDIDATES_PER_SCAN.`}
                >
                  <Input
                    id="maxCandidates"
                    type="number"
                    min={1}
                    max={maxCandidatesLimit}
                    value={maxCandidates}
                    onChange={(event) => setMaxCandidates(event.target.value)}
                    invalid={Boolean(errors.maxCandidates)}
                  />
                </Field>
              </div>

              {droppedByProfile.length > 0 ? (
                <Alert tone="review" title="The Quick profile will skip some selected scopes">
                  {droppedByProfile.map((scope) => DISCOVERY_SCOPE_LABELS[scope]).join(", ")} will
                  not run. Choose <strong>Comprehensive</strong> to include them. A profile narrows
                  your selection — it never adds a scope you did not choose.
                </Alert>
              ) : null}

              {formError ? (
                <Alert tone="critical" role="alert">
                  {formError}
                </Alert>
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                loadingLabel="Starting…"
              >
                <Play aria-hidden="true" />
                {isSimulated ? "Start demo simulation" : "Start scan"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function extractMessage(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error: { message?: string } }).error?.message === "string"
  ) {
    const failures = (payload as { error: { failures?: Array<{ path: string; message: string }> } })
      .error.failures;
    const base = (payload as { error: { message: string } }).error.message;
    if (failures?.length) {
      return `${base} ${failures.map((failure) => failure.message).join(" ")}`;
    }
    return base;
  }
  return null;
}
