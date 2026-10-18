/**
 * Demo relationship fixtures — illustrative only.
 *
 * Every edge here is SYNTHETIC. The `limitations` text on each one is not
 * decoration: it states what the edge does NOT establish, and it is rendered
 * in the graph's node/edge panel and included in exported reports.
 *
 * The rule that shaped this file: a shared host, shared IP address or similar
 * TLS certificate is never, on its own, presented as evidence of shared
 * ownership or control. Edges of those types carry an explicit disclaimer and
 * a deliberately modest confidence score.
 */

import type { RelationshipType } from "@/lib/types/enums";

export interface RelationshipSpec {
  source: string;
  target: string;
  type: RelationshipType;
  confidence: number;
  rationale: string;
  limitations: string;
  relationSource: string;
  observedDaysAgo: number;
  reviewerConfirmed?: boolean;
}

export const RELATIONSHIP_SPECS: RelationshipSpec[] = [
  {
    source: "quotex.net.in",
    target: "quotex.com.in",
    type: "REDIRECTS_TO",
    confidence: 90,
    rationale:
      "The simulated inspection recorded an HTTP 302 from quotex.net.in to https://quotex.com.in/ at the time shown.",
    limitations:
      "A redirect shows where one host sent a request at one moment in time. It does not establish common ownership, control, or any contractual relationship, and redirect targets can change at any time.",
    relationSource: "Website Inspection Agent (simulated)",
    observedDaysAgo: 2,
    reviewerConfirmed: true,
  },
  {
    source: "www.quotex.com",
    target: "quotex.com",
    type: "REDIRECTS_TO",
    confidence: 95,
    rationale: "The simulated inspection recorded an HTTP 301 from the www host to the apex domain.",
    limitations:
      "This is the conventional www-to-apex redirect within one registrable domain. It carries no investigative significance.",
    relationSource: "Website Inspection Agent (simulated)",
    observedDaysAgo: 0,
    reviewerConfirmed: true,
  },
  {
    source: "quotex.com.in",
    target: "app.quotex.com.in",
    type: "SHARES_CERTIFICATE_CHARACTERISTIC",
    confidence: 58,
    rationale:
      "Both hosts were simulated as being served by the same wildcard certificate (*.quotex.com.in), fingerprint bb22cc33…5566.",
    limitations:
      "A shared wildcard certificate is expected between a domain and its own subdomains and proves only that one certificate covers both names. It is not evidence of common ownership or control, and it does not establish who operates either host.",
    relationSource: "Website Inspection Agent (simulated)",
    observedDaysAgo: 2,
  },
  {
    source: "quotex.com.in",
    target: "quotex.net.in",
    type: "SHARES_CERTIFICATE_CHARACTERISTIC",
    confidence: 52,
    rationale:
      "The simulated certificate observations for both hosts carry the same fingerprint (bb22cc33…5566) and the same fixture issuer.",
    limitations:
      "Certificates are routinely reused across unrelated sites by hosting providers and CDNs. A shared fingerprint is a weak correlation signal and is NOT evidence of shared ownership or control.",
    relationSource: "Website Inspection Agent (simulated)",
    observedDaysAgo: 2,
  },
  {
    source: "quotex-mirror-demo.xyz",
    target: "shared-cdn-demo.net",
    type: "SHARES_CERTIFICATE_CHARACTERISTIC",
    confidence: 24,
    rationale:
      "Both hosts were simulated as sharing a certificate fingerprint with a content-delivery host.",
    limitations:
      "The shared party here is a CDN used by many unrelated sites, so this is not evidence of shared ownership or control. This edge exists specifically to demonstrate a signal that must NOT be read as a relationship between operators. The reviewer has marked the CDN host as not related.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 3,
  },
  {
    source: "quotex-mirror-demo.xyz",
    target: "quotex.com.in",
    type: "SIMILAR_WEBSITE_CONTENT",
    confidence: 78,
    rationale:
      "Simulated structural comparison of the two collected pages scored 91/100 on shared layout tokens and element ordering.",
    limitations:
      "Content similarity can arise from a shared template, a purchased theme, or straightforward copying by an unrelated party. It indicates resemblance, not authorship or affiliation.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 2,
    reviewerConfirmed: true,
  },
  {
    source: "quotex-india-demo.com",
    target: "quotex.com",
    type: "SIMILAR_WEBSITE_CONTENT",
    confidence: 66,
    rationale: "Simulated structural comparison scored 71/100 on shared layout tokens.",
    limitations:
      "Moderate resemblance only. Many trading-platform landing pages share conventional layouts; this score alone distinguishes very little.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 3,
  },
  {
    source: "quotexindia-demo.net",
    target: "quotex-india-demo.com",
    type: "SIMILAR_WEBSITE_CONTENT",
    confidence: 61,
    rationale: "Simulated structural comparison scored 66/100 between the two collected pages.",
    limitations: "Resemblance between two synthetic fixture pages. Establishes nothing about either operator.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 4,
  },
  {
    source: "quotex.com.in",
    target: "quotex.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 70,
    rationale:
      "Identical brand label under a different public suffix, with simulated content resemblance of 84/100.",
    limitations:
      "A suspected brand relationship is a hypothesis for a human to test. It is not a finding of impersonation, infringement, affiliation, or any other legal characterisation.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 1,
  },
  {
    source: "quotex.net.in",
    target: "quotex.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 65,
    rationale: "Identical brand label under a different public suffix.",
    limitations:
      "Hypothesis only. Identical brand labels occur legitimately across suffixes, including through authorised regional operations.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 2,
  },
  {
    source: "qu0tex-demo.com",
    target: "quotex.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 54,
    rationale:
      "Visually confusable character substitution ('o' to '0') produces a brand-similarity signal of 83/100.",
    limitations:
      "Lexical confusability is a weak signal on its own. No content was compared for this candidate, and no conclusion about intent can be drawn from a domain name.",
    relationSource: "Domain Enumeration Agent (simulated)",
    observedDaysAgo: 8,
  },
  {
    source: "quotexpro-demo.com",
    target: "quotex.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 50,
    rationale: "Brand label with a 'pro' affix and simulated content resemblance of 62/100.",
    limitations: "Hypothesis only; awaiting a reviewer assessment.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 3,
  },
  {
    source: "quotex.com.in",
    target: "quotex-mirror-demo.xyz",
    type: "APPEARS_IN_SAME_OFFICIAL_REPORT",
    confidence: 80,
    rationale:
      "Both domains are named in the simulated demonstration warning list retrieved from the fixture source.",
    limitations:
      "The source is a FICTIONAL fixture at a reserved .invalid hostname, not a real regulator. Co-occurrence in any list indicates only that one document names both; it does not connect the entities behind them.",
    relationSource: "Regulatory Verification Agent (simulated fixture source)",
    observedDaysAgo: 0,
  },
  {
    source: "quotex.net.in",
    target: "quotex.com.in",
    type: "APPEARS_IN_SAME_OFFICIAL_REPORT",
    confidence: 82,
    rationale:
      "Entries 41 and 42 of the simulated demonstration warning list name both domains consecutively.",
    limitations:
      "Simulated fixture source. Adjacency in a list is a property of the document, not of the entities.",
    relationSource: "Regulatory Verification Agent (simulated fixture source)",
    observedDaysAgo: 0,
  },
  {
    source: "quotex.net.in",
    target: "quotex.com.in",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 88,
    rationale:
      "A named reviewer confirmed this relationship after examining the recorded 302 redirect together with the shared certificate observation and the co-occurrence in the fixture warning list.",
    limitations:
      "Confirmed means a human reviewer judged the recorded evidence sufficient to assert a relationship between the two SITES. It does not identify or attribute conduct to any person or organisation, and the underlying evidence is simulated.",
    relationSource: "Reviewer confirmation (Lakshmi Iyer)",
    observedDaysAgo: 1,
    reviewerConfirmed: true,
  },
  {
    source: "app.quotex.com.in",
    target: "quotex.com.in",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 85,
    rationale:
      "A reviewer confirmed that app.quotex.com.in is a subdomain of the quotex.com.in registrable domain.",
    limitations:
      "A subdomain relationship is a fact about DNS naming. It establishes that one name is beneath the other in the hierarchy, nothing more.",
    relationSource: "Reviewer confirmation (Lakshmi Iyer)",
    observedDaysAgo: 2,
    reviewerConfirmed: true,
  },
  {
    source: "login.quotex.net.in",
    target: "quotex.net.in",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 85,
    rationale: "Subdomain of an existing candidate, confirmed by a reviewer.",
    limitations: "A naming-hierarchy fact only.",
    relationSource: "Reviewer confirmation (Lakshmi Iyer)",
    observedDaysAgo: 6,
    reviewerConfirmed: true,
  },
  {
    source: "my.quotex-india-demo.com",
    target: "quotex-india-demo.com",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 84,
    rationale: "Subdomain of an existing candidate.",
    limitations: "A naming-hierarchy fact only.",
    relationSource: "Domain Enumeration Agent (simulated)",
    observedDaysAgo: 7,
  },
  {
    source: "promo.quotexindia-demo.net",
    target: "quotexindia-demo.net",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 84,
    rationale: "Subdomain of an existing candidate.",
    limitations: "A naming-hierarchy fact only.",
    relationSource: "Domain Enumeration Agent (simulated)",
    observedDaysAgo: 8,
  },
  {
    source: "quotex-bonus-demo.online",
    target: "quotex-signup-demo.net",
    type: "SIMILAR_WEBSITE_CONTENT",
    confidence: 47,
    rationale: "Simulated structural comparison scored 49/100.",
    limitations: "Weak resemblance. Below the threshold at which the signal is informative.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 3,
  },
  {
    source: "binarix-trade-demo.in",
    target: "binarix-demo.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 62,
    rationale: "Identical brand label with a 'trade' affix under a different public suffix.",
    limitations: "Hypothesis only, from the second demonstration investigation.",
    relationSource: "Relationship Analysis Agent (simulated)",
    observedDaysAgo: 1,
  },
  {
    source: "app.binarix-demo.com",
    target: "binarix-demo.com",
    type: "CONFIRMED_RELATIONSHIP",
    confidence: 85,
    rationale: "Subdomain of the Binarix seed domain.",
    limitations: "A naming-hierarchy fact only.",
    relationSource: "Domain Enumeration Agent (simulated)",
    observedDaysAgo: 1,
  },
  {
    source: "binarix-trade-demo.in",
    target: "binarix-demo.com",
    type: "SHARES_CERTIFICATE_CHARACTERISTIC",
    confidence: 49,
    rationale: "Both hosts were simulated as presenting the same certificate fingerprint.",
    limitations:
      "Certificate reuse is common across unrelated sites on shared hosting, so this is not evidence of shared ownership or control.",
    relationSource: "Website Inspection Agent (simulated)",
    observedDaysAgo: 1,
  },
  {
    source: "quotexpertise-demo.com",
    target: "quotex.com",
    type: "SUSPECTED_BRAND_RELATIONSHIP",
    confidence: 18,
    rationale:
      "The brand token appears as a substring of an unrelated business name. Retained so the graph shows a signal that a reviewer correctly rejected.",
    limitations:
      "The reviewer examined this and marked the domain NOT RELATED. This edge is kept visible as a worked example of a lexical false positive, not as an open hypothesis.",
    relationSource: "Domain Enumeration Agent (simulated)",
    observedDaysAgo: 6,
  },
];
