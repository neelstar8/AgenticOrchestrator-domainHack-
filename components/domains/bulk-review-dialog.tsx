"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES, REVIEW_STATUSES } from "@/lib/types/enums";
import type { Priority, ReviewStatus } from "@/lib/types/enums";
import { PRIORITY_LABELS, REVIEW_STATUS_LABELS } from "@/lib/utils/labels";

/**
 * Bulk review-status update.
 *
 * A reason is mandatory: a change applied to fifty domains at once has to be
 * explainable to whoever reads the audit log later. Domains already included
 * in a report are skipped server-side and reported back individually, rather
 * than silently overwritten.
 */
export function BulkReviewDialog({
  domainIds,
  onDone,
}: {
  domainIds: string[];
  onDone: () => void;
}) {
  const { push } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reviewStatus, setReviewStatus] = React.useState<ReviewStatus>("UNDER_REVIEW");
  const [priority, setPriority] = React.useState<Priority | "">("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters so this change is explainable later.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/domains/bulk-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainIds,
          reviewStatus,
          priority: priority || undefined,
          reason: reason.trim(),
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        setError(
          (payload as { error?: { message?: string } }).error?.message ??
            "The update could not be applied.",
        );
        setSubmitting(false);
        return;
      }

      const data = (payload as {
        data: { updated: number; skipped: Array<{ id: string; reason: string }> };
      }).data;

      push({
        tone: data.skipped.length > 0 ? "review" : "verified",
        title: `${data.updated} domain${data.updated === 1 ? "" : "s"} updated`,
        description:
          data.skipped.length > 0
            ? `${data.skipped.length} were skipped and left unchanged.`
            : `Review status set to ${REVIEW_STATUS_LABELS[reviewStatus]}.`,
        details: data.skipped.map((entry) => entry.reason),
      });

      setOpen(false);
      setReason("");
      onDone();
    } catch {
      setError("Could not reach the server. Check that it is running and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <ListChecks aria-hidden="true" />
          Set review status
        </Button>
      </DialogTrigger>

      <DialogContent size="sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Update {domainIds.length} domains</DialogTitle>
            <DialogDescription>
              The same review status will be applied to every selected domain, and each change is
              recorded separately in the audit log.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-4">
            <Field label="Review status" htmlFor="bulk-status" required>
              <Select
                value={reviewStatus}
                onValueChange={(value) => setReviewStatus(value as ReviewStatus)}
              >
                <SelectTrigger id="bulk-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVIEW_STATUSES.filter((status) => status !== "INCLUDED_IN_REPORT").map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {REVIEW_STATUS_LABELS[status]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Priority"
              htmlFor="bulk-priority"
              hint="Optional. Leave unset to keep each domain's current priority."
            >
              <Select
                value={priority || "__keep__"}
                onValueChange={(value) => setPriority(value === "__keep__" ? "" : (value as Priority))}
              >
                <SelectTrigger id="bulk-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current priority</SelectItem>
                  {PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PRIORITY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Reason"
              htmlFor="bulk-reason"
              required
              hint="Recorded against every affected domain in the audit log."
            >
              <Textarea
                id="bulk-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Why these domains are being set to this status."
              />
            </Field>

            <Alert tone="info">
              Domains already marked <strong>Included in report</strong> are skipped: a bulk action
              must not quietly undo a decision that a report depends on.
            </Alert>

            {error ? (
              <Alert tone="critical" role="alert">
                {error}
              </Alert>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
              loadingLabel="Applying…"
            >
              Apply to {domainIds.length} domain{domainIds.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
