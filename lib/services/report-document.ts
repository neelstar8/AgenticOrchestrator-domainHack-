import "server-only";

import { createProviderRegistry } from "@/agents/providers/registry";
import { createProviderContext, type ReportDocumentSection } from "@/agents/providers/types";
import {
  ABSENCE_IS_NOT_AUTHORISATION_NOTICE,
  SHARED_INFRASTRUCTURE_NOTICE,
  SIGNAL_NOT_DETERMINATION_NOTICE,
  SIMULATION_NOTICE,
} from "@/lib/config/constants";
import { getRepository } from "@/lib/repositories";
import type { ReportDetail } from "@/lib/types/views";
import {
  AUDIT_ACTION_LABELS,
  DNS_STATUS_LABELS,
  EVIDENCE_COLLECTION_METHOD_LABELS,
  EVIDENCE_KIND_LABELS,
  NOT_CHECKED_LABEL,
  PRIORITY_LABELS,
  RECEIVING_AUTHORITY_LABELS,
  REPORT_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/utils/labels";
import { formatDateTime, formatHttpStatus, truncate } from "@/lib/utils/format";

/**
 * Builds the structured document that becomes an exported report.
 *
 * The section order is deliberate and is the heart of the product's claim to
 * be usable next to a real regulatory process:
 *
 *   1. Provenance first. If the content is simulated, the cover says so before
 *      anything else, and every page footer repeats it.
 *   2. Observations and interpretations are in SEPARATE sections with
 *      different headings, never interleaved. A reader can see at a glance
 *      which statements were observed and which were inferred.
 *   3. Limitations are a required section, not an appendix.
 *   4. Every evidence row carries its label, its source URL and its
 *      collection timestamp, so a recipient can re-check it independently.
 *   5. The audit trail is included, so the recipient can see who did what.
 */

export interface BuildReportDocumentOptions {
  includeAuditTrail: boolean;
  organisationName: string;
  contactEmail: string;
}

export async function buildReportSections(
  report: ReportDetail,
  options: BuildReportDocumentOptions,
): Promise<ReportDocumentSection[]> {
  const sections: ReportDocumentSection[] = [];
  const isSimulated = report.origin === "SIMULATED_DEMO";

  // --- 1. Scope -----------------------------------------------------------
  sections.push({
    heading: "1. Scope and status",
    paragraphs: [
      `Report reference: ${report.reference}`,
      `Workflow status: ${REPORT_STATUS_LABELS[report.status]}. ${report.status === "SUBMITTED" || report.status === "RESPONSE_RECEIVED" || report.status === "ACTION_CONFIRMED" ? "A person recorded an out-of-band submission; Sentinel does not transmit reports." : ""}`,
      `Intended receiving authority: ${RECEIVING_AUTHORITY_LABELS[report.receivingAuthority]}${report.authorityOther ? ` (${report.authorityOther})` : ""}`,
      `Prepared by: ${report.preparedBy?.name ?? "Unknown"} on ${formatDateTime(report.createdAt)}`,
      report.approvedBy
        ? `Approved by: ${report.approvedBy.name} on ${formatDateTime(report.approvedAt)}`
        : "Approval: this report has not been approved by a reviewer.",
      `Domains covered: ${report.domains.length}. Evidence items attached: ${report.evidence.length}.`,
      report.submissionReference
        ? `Submission reference recorded by hand: ${report.submissionReference} (${report.submissionChannel ?? "channel not recorded"}).`
        : "No submission reference has been recorded.",
      `Contact for queries: ${options.contactEmail}`,
    ].filter(Boolean),
    callout: isSimulated ? SIMULATION_NOTICE : undefined,
  });

  // --- 2. Executive summary ----------------------------------------------
  sections.push({
    heading: "2. Executive summary",
    paragraphs: splitParagraphs(report.executiveSummary),
  });

  // --- 3. Domains in scope -----------------------------------------------
  sections.push({
    heading: "3. Domains covered by this report",
    paragraphs: [
      "Each row records what was observed about one candidate domain, together with the review " +
        "status a named reviewer assigned to it. A field reading \"Not checked\" means no check " +
        "was attempted; it is not a negative result.",
    ],
    table: {
      headers: ["Domain", "DNS", "HTTP", "Evidence", "Review status", "Priority"],
      rows: report.domains.map((domain) => [
        domain.fqdn,
        domain.dnsStatus ? DNS_STATUS_LABELS[domain.dnsStatus] : NOT_CHECKED_LABEL,
        domain.httpStatusCode === null
          ? NOT_CHECKED_LABEL
          : formatHttpStatus(domain.httpStatusCode),
        `${domain.evidenceCompleteness}% (${domain.evidenceCount} item${domain.evidenceCount === 1 ? "" : "s"})`,
        REVIEW_STATUS_LABELS[domain.reviewStatus],
        PRIORITY_LABELS[domain.priority],
      ]),
    },
  });

  const rationales = report.domains.filter((domain) => domain.includedRationale);
  if (rationales.length > 0) {
    sections.push({
      heading: "3.1 Why each domain is included",
      paragraphs: rationales.map(
        (domain) => `${domain.fqdn} — ${domain.includedRationale ?? ""}`,
      ),
    });
  }

  // --- 4. Observed facts --------------------------------------------------
  const observedFacts = report.evidence.filter((item) => item.kind === "OBSERVED_FACT");
  sections.push({
    heading: "4. Observed facts",
    paragraphs:
      observedFacts.length === 0
        ? [
            "No observed facts are attached to this report. Nothing in it rests on a direct " +
              "observation, which is a significant limitation.",
          ]
        : [
            `${observedFacts.length} directly observed, timestamped item(s). Each was recorded ` +
              "by a check at the time shown and can be re-verified independently.",
          ],
    table:
      observedFacts.length === 0
        ? undefined
        : {
            headers: ["Domain", "Observation", "Collected (UTC)", "Source"],
            rows: observedFacts
              .slice(0, 120)
              .map((item) => [
                item.domainFqdn ?? "—",
                truncate(`${item.title}. ${item.description}`, 320),
                formatDateTime(item.collectedAt),
                item.sourceUrl ?? item.sourceLabel ?? "—",
              ]),
          },
  });

  // --- 5. Official-source matches -----------------------------------------
  const sourceMatches = report.evidence.filter((item) => item.kind === "OFFICIAL_SOURCE_MATCH");
  sections.push({
    heading: "5. Official-source matches",
    paragraphs:
      sourceMatches.length === 0
        ? [
            "No official-source match is attached to this report. No configured regulatory " +
              "source has been recorded as naming any domain covered here.",
            ABSENCE_IS_NOT_AUTHORISATION_NOTICE,
          ]
        : [
            `${sourceMatches.length} match(es) against configured sources. Each shows that a ` +
              "document contains a term. It does not, on its own, establish the identity of the " +
              "entity behind the term or any legal characterisation of it.",
          ],
    table:
      sourceMatches.length === 0
        ? undefined
        : {
            headers: ["Domain", "Match", "Source", "Retrieved (UTC)"],
            rows: sourceMatches
              .slice(0, 60)
              .map((item) => [
                item.domainFqdn ?? "—",
                truncate(item.description, 320),
                item.sourceLabel ?? item.sourceUrl ?? "—",
                formatDateTime(item.collectedAt),
              ]),
          },
    callout: ABSENCE_IS_NOT_AUTHORISATION_NOTICE,
  });

  // --- 6. Reviewer assessments --------------------------------------------
  const assessments = report.evidence.filter((item) => item.kind === "REVIEWER_ASSESSMENT");
  if (assessments.length > 0) {
    sections.push({
      heading: "6. Reviewer assessments",
      paragraphs: [
        "Judgements recorded by named human reviewers. These are professional assessments of " +
          "the evidence on file, not legal determinations.",
        ...assessments
          .slice(0, 40)
          .map(
            (item) =>
              `${item.domainFqdn ?? "General"} — ${item.description} (recorded ${formatDateTime(item.collectedAt)})`,
          ),
      ],
    });
  }

  // --- 7. AI-generated interpretation — kept separate ---------------------
  const inferences = report.evidence.filter((item) => item.kind === "INFERRED_RELATIONSHIP");
  const unverified = report.evidence.filter((item) => item.kind === "UNVERIFIED_CLAIM");

  sections.push({
    heading: "7. Inferred analysis and unverified claims (NOT observations)",
    paragraphs: [
      "This section is kept separate from the observed facts above because its contents were " +
        "derived rather than observed. Nothing here should be read as a finding.",
      inferences.length > 0
        ? `${inferences.length} inferred relationship(s) were produced by correlation analysis. ` +
          "Each carries a confidence score and stated limitations."
        : "No inferred relationships are attached to this report.",
      unverified.length > 0
        ? `${unverified.length} unverified claim(s) are recorded for context — for example a ` +
          "hostname appearing in search results. These have not been independently checked."
        : "No unverified claims are attached to this report.",
      SIGNAL_NOT_DETERMINATION_NOTICE,
    ],
    table:
      inferences.length === 0
        ? undefined
        : {
            headers: ["Domain", "Inference", "Confidence", "What it does not establish"],
            rows: inferences
              .slice(0, 60)
              .map((item) => [
                item.domainFqdn ?? "—",
                truncate(`${item.title}. ${item.description}`, 260),
                item.confidence === null ? "—" : `${item.confidence}/100`,
                truncate(item.limitations ?? "—", 260),
              ]),
          },
    callout: SIGNAL_NOT_DETERMINATION_NOTICE,
  });

  // --- 8. Relationships ---------------------------------------------------
  const repository = await getRepository();
  const relationships = await repository.listRelationships({ limit: 400 });
  const domainIds = new Set(report.domains.map((domain) => domain.id));
  const relevant = relationships.filter(
    (relationship) =>
      domainIds.has(relationship.sourceDomainId) || domainIds.has(relationship.targetDomainId),
  );

  if (relevant.length > 0) {
    sections.push({
      heading: "8. Observed and inferred relationships",
      paragraphs: [
        "Relationships between the domains covered here and other candidates. The final column " +
          "states what each relationship does NOT establish, which is as important as the " +
          "relationship itself.",
      ],
      table: {
        headers: ["From", "To", "Type", "Confidence", "Limitations"],
        rows: relevant
          .slice(0, 60)
          .map((relationship) => [
            relationship.sourceDomain.fqdn,
            relationship.targetDomain.fqdn,
            relationship.type.replace(/_/g, " ").toLowerCase(),
            `${relationship.confidence}/100${relationship.reviewerConfirmed ? " (reviewer-confirmed)" : ""}`,
            truncate(relationship.limitations, 260),
          ]),
      },
      callout: SHARED_INFRASTRUCTURE_NOTICE,
    });
  }

  // --- 9. Findings and recommendations ------------------------------------
  sections.push({
    heading: "9. Findings",
    paragraphs: splitParagraphs(report.findings),
  });

  sections.push({
    heading: "10. Recommendations",
    paragraphs: splitParagraphs(report.recommendations),
  });

  // --- 11. Limitations — required -----------------------------------------
  sections.push({
    heading: "11. Limitations and uncertainty",
    paragraphs: splitParagraphs(report.limitations),
    callout:
      "Read this section before acting on anything above. A report without stated limitations " +
      "cannot be generated by Sentinel, because its evidence always has limits.",
  });

  // --- 12. Methodology ----------------------------------------------------
  sections.push({
    heading: "12. Methodology",
    paragraphs: splitParagraphs(report.methodology),
  });

  // --- 13. Audit trail ----------------------------------------------------
  if (options.includeAuditTrail && report.auditEvents.length > 0) {
    sections.push({
      heading: "13. Audit trail for this report",
      paragraphs: [
        "Every recorded action on this report, newest first. Sentinel's audit log is " +
          "append-only by application and database design. It is not cryptographically " +
          "tamper-proof, and no such claim is made.",
      ],
      table: {
        headers: ["When (UTC)", "Actor", "Action", "Reason"],
        rows: report.auditEvents
          .slice(0, 80)
          .map((event) => [
            formatDateTime(event.occurredAt),
            event.actorLabel,
            AUDIT_ACTION_LABELS[event.action],
            truncate(event.reason ?? "—", 220),
          ]),
      },
    });
  }

  // --- 14. Evidence index -------------------------------------------------
  sections.push({
    heading: `${options.includeAuditTrail && report.auditEvents.length > 0 ? "14" : "13"}. Full evidence index`,
    paragraphs: [
      "Every evidence item attached to this report, with its epistemic label, collection method, " +
        "collection time and source reference, so a recipient can re-check any of it.",
    ],
    table: {
      headers: ["Label", "Domain", "Title", "Method", "Collected (UTC)", "Source"],
      rows: report.evidence
        .slice(0, 200)
        .map((item) => [
          EVIDENCE_KIND_LABELS[item.kind],
          item.domainFqdn ?? "—",
          truncate(item.title, 160),
          EVIDENCE_COLLECTION_METHOD_LABELS[item.collectionMethod],
          formatDateTime(item.collectedAt),
          item.sourceUrl ?? item.sourceLabel ?? "—",
        ]),
    },
  });

  return sections;
}

export interface GeneratedReportPdf {
  bytes: Uint8Array;
  filename: string;
}

export async function generateReportPdf(
  report: ReportDetail,
  options: BuildReportDocumentOptions,
): Promise<GeneratedReportPdf> {
  const sections = await buildReportSections(report, options);
  const providers = createProviderRegistry();
  const { context, dispose } = createProviderContext(`report-pdf-${report.id}`, 60_000);

  try {
    const result = await providers.reportGeneration.renderPdf(
      {
        reference: report.reference,
        title: report.title,
        organisationName: options.organisationName,
        preparedByName: report.preparedBy?.name ?? "Unknown",
        preparedAt: formatDateTime(report.createdAt),
        approvedByName: report.approvedBy?.name ?? null,
        receivingAuthorityLabel:
          RECEIVING_AUTHORITY_LABELS[report.receivingAuthority] +
          (report.authorityOther ? ` (${report.authorityOther})` : ""),
        statusLabel: REPORT_STATUS_LABELS[report.status],
        simulationNotice: report.origin === "SIMULATED_DEMO" ? SIMULATION_NOTICE : null,
        sections,
        footerNote:
          "Investigative material. Similarity scores and inferred relationships are signals, " +
          "not legal determinations. See the Limitations section.",
      },
      context,
    );

    if (!result.ok) {
      throw new Error(`Could not generate the PDF: ${result.error.message}`);
    }

    return {
      bytes: result.data,
      filename: `${report.reference}-${report.status.toLowerCase()}.pdf`,
    };
  } finally {
    dispose();
  }
}

/** CSV export of a report's domains and evidence, for spreadsheet review. */
export function generateReportCsv(report: ReportDetail): { csv: string; filename: string } {
  const cell = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines: string[] = [
    `# ${report.reference} — ${report.title}`,
    `# Status: ${REPORT_STATUS_LABELS[report.status]}`,
    `# Receiving authority: ${RECEIVING_AUTHORITY_LABELS[report.receivingAuthority]}`,
    `# Exported at ${new Date().toISOString()}`,
    report.origin === "SIMULATED_DEMO" ? `# ${SIMULATION_NOTICE}` : "# Data origin: live",
    `# ${SIGNAL_NOT_DETERMINATION_NOTICE}`,
    "",
    "## Domains",
    [
      "Domain",
      "Review status",
      "Priority",
      "DNS status",
      "HTTP status",
      "Evidence completeness (%)",
      "Inclusion rationale",
    ]
      .map(cell)
      .join(","),
  ];

  for (const domain of report.domains) {
    lines.push(
      [
        domain.fqdn,
        REVIEW_STATUS_LABELS[domain.reviewStatus],
        PRIORITY_LABELS[domain.priority],
        domain.dnsStatus ? DNS_STATUS_LABELS[domain.dnsStatus] : NOT_CHECKED_LABEL,
        domain.httpStatusCode === null
          ? NOT_CHECKED_LABEL
          : formatHttpStatus(domain.httpStatusCode),
        domain.evidenceCompleteness,
        domain.includedRationale ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }

  lines.push("", "## Evidence");
  lines.push(
    [
      "Evidence label",
      "Domain",
      "Title",
      "Description",
      "Collection method",
      "Collected (UTC)",
      "Source URL",
      "Confidence",
      "Limitations",
      "Data origin",
    ]
      .map(cell)
      .join(","),
  );

  for (const item of report.evidence) {
    lines.push(
      [
        EVIDENCE_KIND_LABELS[item.kind],
        item.domainFqdn ?? "",
        item.title,
        item.description,
        EVIDENCE_COLLECTION_METHOD_LABELS[item.collectionMethod],
        formatDateTime(item.collectedAt),
        item.sourceUrl ?? "",
        item.confidence ?? "",
        item.limitations ?? "",
        item.origin === "SIMULATED_DEMO" ? "SIMULATED DEMO DATA" : "Live",
      ]
        .map(cell)
        .join(","),
    );
  }

  lines.push("", "## Limitations", cell(report.limitations));

  return {
    csv: lines.join("\n"),
    filename: `${report.reference}.csv`,
  };
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}
