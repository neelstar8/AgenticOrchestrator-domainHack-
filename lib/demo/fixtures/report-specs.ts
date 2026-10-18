/**
 * Demo report fixtures — one report in each of six workflow states.
 *
 * Two honesty rules shaped the contents:
 *
 *  1. A report is only marked SUBMITTED, RESPONSE_RECEIVED or ACTION_CONFIRMED
 *     where the fixture also records the human workflow steps that establish
 *     it — an approver, a submission reference entered by a person, a recorded
 *     response. Sentinel never transmits a report anywhere, so "submitted"
 *     always means "a human recorded that they submitted it out of band".
 *  2. Every report body separates factual observations from AI-generated
 *     interpretation, and every one states its limitations. The `limitations`
 *     field is required by the schema for exactly this reason.
 */

import type { ReceivingAuthority, ReportStatus } from "@/lib/types/enums";

export interface ReportSpec {
  reference: string;
  title: string;
  status: ReportStatus;
  receivingAuthority: ReceivingAuthority;
  preparedBy: "investigator" | "reviewer" | "admin";
  approvedBy?: "reviewer" | "admin";
  createdDaysAgo: number;
  domainFqdns: string[];
  domainRationales?: Record<string, string>;
  executiveSummary: string;
  findings: string;
  recommendations: string;
  limitations: string;
  methodology: string;

  approvedDaysAgo?: number;
  submittedDaysAgo?: number;
  submissionReference?: string;
  submissionChannel?: string;
  responseDaysAgo?: number;
  responseSummary?: string;
  outcomeDaysAgo?: number;
  outcomeSummary?: string;
  closedDaysAgo?: number;
  closingNote?: string;
}

const STANDARD_METHODOLOGY = `Sentinel ran a simulated multi-agent discovery workflow over synthetic fixtures. For each candidate domain the pipeline was:

1. Web Discovery — candidate URLs from the configured search provider (simulated).
2. Domain Enumeration — a bounded set of name variations generated as candidates FOR VERIFICATION, then checked against the configured resolver (simulated). Generation does not enumerate every possible domain.
3. Website Inspection — public page metadata, visible content and redirect behaviour only. No authentication was attempted, no non-public resource was requested, and no vulnerability was probed.
4. Regulatory Verification — comparison against the configured source list. Real authority sources were NOT retrieved because live fetching is disabled; only the simulated fixture sources were consulted.
5. Relationship Analysis — correlation of the above into explainable edges with stated confidence and limitations.
6. Evidence Reporting — completeness scoring and this draft.

Every item is timestamped and carries its source reference and an explicit evidence label.`;

const STANDARD_LIMITATIONS = `This report rests on SIMULATED DEMONSTRATION DATA produced by Sentinel's local fixture provider. It is not the result of a real search query, DNS resolution, HTTP request, certificate retrieval, language-model call, or regulatory source retrieval.

Specific limitations:

- No real regulatory source was retrieved. Sentinel has recorded no match against any genuine authority publication, and the matches referenced here come from a clearly-labelled fictional fixture source at a reserved .invalid hostname.
- Absence from any warning list is NOT evidence of regulatory authorisation. Authorisation can only be established from a positive entry in an authorised-entity register.
- Similarity scores (lexical and structural) are investigative signals for triage. They are not findings of impersonation, infringement, fraud or illegality.
- Shared hosting, a shared IP address or a shared TLS certificate characteristic does NOT establish shared ownership or control. Such infrastructure is routinely shared between unrelated parties.
- A redirect records where one host sent one request at one moment. Redirect targets change.
- Registrant and beneficial-ownership information was not obtained and is not asserted anywhere in this report.
- Nothing in this document is a legal determination. It is investigative material prepared to assist an authorised reviewer.`;

export const REPORT_SPECS: ReportSpec[] = [
  {
    reference: "SNT-RPT-2026-0001",
    title: "Draft — Quotex Investigation Demo: initial candidate set",
    status: "DRAFT",
    receivingAuthority: "INTERNAL_RECORD_ONLY",
    preparedBy: "investigator",
    createdDaysAgo: 20,
    domainFqdns: ["quotex.com", "quotex.com.in", "quotex.net.in"],
    domainRationales: {
      "quotex.com": "Investigation anchor. Included for context, not as a subject of concern.",
      "quotex.com.in": "Escalated candidate with the fullest simulated evidence set.",
      "quotex.net.in": "Escalated candidate with a recorded simulated redirect.",
    },
    executiveSummary:
      "Working draft recording the initial candidate set for the Quotex Investigation Demo " +
      "(SNT-DEMO-2026-0147). Three candidates are described. No conclusion is offered and no " +
      "authority is addressed; this draft exists as an internal working record only.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- quotex.com.in returned HTTP 200 with a recorded page title at the time shown.\n" +
      "- quotex.net.in returned HTTP 302 to https://quotex.com.in/ at the time shown.\n" +
      "- Both candidates presented the same simulated certificate fingerprint.\n\n" +
      "AI-GENERATED INTERPRETATION (not observation)\n" +
      "- The Relationship Analysis Agent proposes a suspected brand relationship between the " +
      "two .in candidates and the seed domain at 65-70 confidence. This is a hypothesis for a " +
      "human to test, not a conclusion.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Who operates any of these sites.\n" +
      "- Whether any of them is authorised or unauthorised.",
    recommendations:
      "1. Have a named reviewer verify each observed fact against a live check before this draft " +
      "progresses.\n" +
      "2. Query the real SEBI and RBI sources manually; Sentinel has not retrieved them.\n" +
      "3. Do not progress this draft until the limitations section can be narrowed.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
  {
    reference: "SNT-RPT-2026-0002",
    title: "Awaiting review — Quotex Investigation Demo: .in suffix candidates",
    status: "AWAITING_REVIEW",
    receivingAuthority: "SEBI",
    preparedBy: "investigator",
    createdDaysAgo: 14,
    domainFqdns: ["quotex.com.in", "quotex.net.in", "app.quotex.com.in", "login.quotex.net.in"],
    executiveSummary:
      "Four candidate domains under Indian public suffixes are submitted for internal review. " +
      "The intended receiving authority, if the review approves it, would be SEBI. The report " +
      "has NOT been sent anywhere; Sentinel does not transmit reports.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- Four hosts resolved and returned HTTP responses at the times recorded.\n" +
      "- app.quotex.com.in and quotex.com.in share a simulated wildcard certificate.\n" +
      "- quotex.net.in redirected to quotex.com.in.\n\n" +
      "OFFICIAL-SOURCE MATCHES\n" +
      "- Two exact-domain matches were recorded against a SIMULATED FIXTURE warning list at a " +
      "reserved .invalid hostname. No match has been recorded against any genuine authority " +
      "publication, because none has been retrieved.\n\n" +
      "AI-GENERATED INTERPRETATION (not observation)\n" +
      "- Correlation analysis groups the four hosts into one cluster at 58-85 confidence, on the " +
      "basis of naming hierarchy and shared certificate observations.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Common ownership or control. The shared-certificate signal explicitly does not support it.",
    recommendations:
      "1. A reviewer should independently check each domain against the real SEBI and RBI " +
      "publications before approval.\n" +
      "2. Treat the fixture-source matches as placeholders with no evidential weight.\n" +
      "3. Obtain live observations to replace the simulated ones before any submission.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
  {
    reference: "SNT-RPT-2026-0003",
    title: "Approved — Quotex Investigation Demo: mirrored-layout candidate",
    status: "APPROVED",
    receivingAuthority: "SEBI",
    preparedBy: "investigator",
    approvedBy: "reviewer",
    createdDaysAgo: 11,
    approvedDaysAgo: 8,
    domainFqdns: ["quotex-mirror-demo.xyz", "quotex.com.in"],
    domainRationales: {
      "quotex-mirror-demo.xyz":
        "Highest recorded content-similarity signal in the dataset, with a reviewer assessment on file.",
    },
    executiveSummary:
      "Approved internally for onward submission to SEBI. Describes one candidate whose " +
      "simulated page content closely resembles another candidate's. Approval means a named " +
      "reviewer judged the recorded evidence adequate for referral — it is not a finding of " +
      "wrongdoing, and the underlying data remains simulated.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- quotex-mirror-demo.xyz returned HTTP 200 with a recorded page title.\n" +
      "- Structural comparison against quotex.com.in scored 91/100.\n\n" +
      "REVIEWER ASSESSMENT\n" +
      "- The reviewer records that the resemblance is strong enough to merit a referral for " +
      "official examination, while noting it is consistent with a shared template.\n\n" +
      "AI-GENERATED INTERPRETATION (not observation)\n" +
      "- A 78-confidence 'similar website content' edge was proposed by the Relationship " +
      "Analysis Agent and subsequently confirmed by the reviewer.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Authorship of either page, or any relationship between the operators.",
    recommendations:
      "1. Refer to SEBI for official examination.\n" +
      "2. Preserve the collected page snapshots and their collection timestamps.\n" +
      "3. Re-verify every observation live before relying on this report outside the demo.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
  {
    reference: "SNT-RPT-2026-0004",
    title: "Submitted — Quotex Investigation Demo: escalated .in candidates",
    status: "SUBMITTED",
    receivingAuthority: "SEBI",
    preparedBy: "investigator",
    approvedBy: "reviewer",
    createdDaysAgo: 18,
    approvedDaysAgo: 15,
    submittedDaysAgo: 14,
    submissionReference: "DEMO-SEBI-REF-2026-004417 (simulated reference, entered by hand)",
    submissionChannel: "Recorded manually after out-of-band submission (demonstration record)",
    domainFqdns: ["quotex.com.in", "quotex.net.in"],
    executiveSummary:
      "A reviewer recorded that this report was submitted to SEBI out of band and entered the " +
      "reference shown. Sentinel did not transmit anything: the SUBMITTED status reflects a " +
      "human data-entry step, and the reference is itself a simulated demonstration value.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- Both domains resolved and returned HTTP responses at the recorded times.\n" +
      "- A 302 redirect was recorded from quotex.net.in to quotex.com.in.\n\n" +
      "OFFICIAL-SOURCE MATCHES\n" +
      "- Exact-domain matches recorded against a SIMULATED FIXTURE list only.\n\n" +
      "REVIEWER ASSESSMENT\n" +
      "- The reviewer judged the cluster worth referring for official examination.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Any legal characterisation of either domain or its operator.",
    recommendations:
      "1. Await the authority's response and record it against this report.\n" +
      "2. Re-check both domains at the configured interval; redirect targets change.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
  {
    reference: "SNT-RPT-2026-0005",
    title: "Response received — Quotex Investigation Demo: acknowledgement recorded",
    status: "RESPONSE_RECEIVED",
    receivingAuthority: "RBI",
    preparedBy: "reviewer",
    approvedBy: "admin",
    createdDaysAgo: 22,
    approvedDaysAgo: 20,
    submittedDaysAgo: 19,
    submissionReference: "DEMO-RBI-REF-2026-001182 (simulated reference, entered by hand)",
    submissionChannel: "Recorded manually after out-of-band submission (demonstration record)",
    responseDaysAgo: 12,
    responseSummary:
      "SIMULATED DEMONSTRATION RESPONSE. A reviewer recorded that an acknowledgement was " +
      "received and that the matter was taken on file for examination. No outcome was stated. " +
      "This text is a fixture written for the demo dataset and does not reproduce any real " +
      "communication from any authority.",
    domainFqdns: ["quotex-india-demo.com", "quotexindia-demo.net"],
    executiveSummary:
      "An acknowledgement has been recorded against this report. An acknowledgement confirms " +
      "receipt only — it is not a finding, a direction, or confirmation of any action.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- Both domains resolved and returned HTTP 200 with recorded page titles.\n" +
      "- Structural comparison between them scored 66/100.\n\n" +
      "AI-GENERATED INTERPRETATION (not observation)\n" +
      "- A 61-confidence content-similarity edge was proposed between the two.\n\n" +
      "AUTHORITY RESPONSE\n" +
      "- Acknowledgement recorded by a reviewer. Contains no determination.\n\n" +
      "NOT ESTABLISHED\n" +
      "- Any outcome. The authority has not stated one.",
    recommendations:
      "1. Keep the report open pending a substantive response.\n" +
      "2. Do not describe this matter as actioned; only an acknowledgement exists.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
  {
    reference: "SNT-RPT-2026-0006",
    title: "Action confirmed — Quotex Investigation Demo: outcome recorded (simulated)",
    status: "ACTION_CONFIRMED",
    receivingAuthority: "SEBI",
    preparedBy: "investigator",
    approvedBy: "reviewer",
    createdDaysAgo: 27,
    approvedDaysAgo: 25,
    submittedDaysAgo: 24,
    submissionReference: "DEMO-SEBI-REF-2026-003901 (simulated reference, entered by hand)",
    submissionChannel: "Recorded manually after out-of-band submission (demonstration record)",
    responseDaysAgo: 17,
    responseSummary:
      "SIMULATED DEMONSTRATION RESPONSE. A reviewer recorded that a substantive response was " +
      "received. Fixture text; not a real communication.",
    outcomeDaysAgo: 10,
    outcomeSummary:
      "SIMULATED DEMONSTRATION OUTCOME. A reviewer recorded a confirmed official action with a " +
      "reference, which is what makes this report count towards the 'Confirmed official actions' " +
      "figure on the Overview page. The metric therefore measures recorded workflow state — not " +
      "any real-world enforcement, and not anything Sentinel did. Sentinel cannot block a domain " +
      "and does not claim that any domain has been blocked.",
    domainFqdns: ["quotex-trade-demo.co.in"],
    executiveSummary:
      "Closed-loop demonstration of the full workflow: drafted, approved, submitted with a " +
      "manually entered reference, response recorded, outcome recorded. Every step is a " +
      "human-entered demonstration record.",
    findings:
      "OBSERVED FACTS (simulated)\n" +
      "- The candidate returned HTTP 403, so no page content could be collected. This is recorded " +
      "as a server response, not as a conclusion about the site.\n\n" +
      "REVIEWER ASSESSMENT\n" +
      "- The reviewer noted that evidence was thin and said so explicitly in the referral.\n\n" +
      "RECORDED OUTCOME\n" +
      "- A confirmed action was recorded by a reviewer with a reference (simulated).\n\n" +
      "NOT ESTABLISHED\n" +
      "- Nothing beyond the recorded workflow steps. This is a demonstration of process, not of fact.",
    recommendations:
      "1. Treat this report as a worked example of the workflow rather than as investigative content.\n" +
      "2. Close the record once no further action is planned.",
    limitations: STANDARD_LIMITATIONS,
    methodology: STANDARD_METHODOLOGY,
  },
];
