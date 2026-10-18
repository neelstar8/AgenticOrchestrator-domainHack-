import "server-only";

import { runAgent, type AgentExecutionContext, type AgentEvidence, type AgentRelationship, type DomainObservation, type SentinelAgent } from "@/agents/contracts/types";
import { AgentExecutionError, AgentValidationError } from "@/agents/contracts/types";
import { SENTINEL_AGENTS } from "@/agents/implementations/agents";
import { createProviderContext, type ProviderRegistry } from "@/agents/providers/types";
import type { SentinelRepository } from "@/lib/repositories/types";
import type {
  AgentKey,
  DataOrigin,
  DiscoveryScope,
  Priority,
  ScanStatus,
  TaskStatus,
} from "@/lib/types/enums";
import type { AgentTask, Scan, User } from "@/lib/types/models";
import type { ScanProgress } from "@/lib/types/views";
import { AGENT_LABELS } from "@/lib/utils/labels";
import { tryNormalizeDomain } from "@/lib/utils/domain-name";

/**
 * ScanOrchestrator.
 *
 * Runs an explicit, bounded, deterministic pipeline — deliberately NOT an
 * autonomous agent loop. The sequence of steps is written out below and can
 * be read, tested and audited; an agent cannot decide to call another agent,
 * retry itself indefinitely, or widen its own scope.
 *
 * Responsibilities, all in one place so the audit trail is complete:
 *   - create the scan's agent tasks up front, so the UI can show the whole
 *     plan before anything runs;
 *   - pass structured, validated results between agents;
 *   - retry a failed task up to its attempt limit, then fail it honestly;
 *   - deduplicate candidates by normalised FQDN;
 *   - persist domains, evidence, relationships and regulatory records;
 *   - honour cancellation promptly;
 *   - record an audit event for every state change;
 *   - expose live progress to the UI.
 *
 * One guardrail is enforced here rather than in an agent, because an agent
 * could be swapped: `clampAgentPriority` prevents any agent-suggested
 * priority from exceeding MEDIUM. Escalation to HIGH or CRITICAL is a human
 * decision, recorded against a named reviewer.
 */

export interface ScanRunOptions {
  scan: Scan;
  actor: Pick<User, "id" | "name">;
  repository: SentinelRepository;
  providers: ProviderRegistry;
  requestId: string;
  /** Overall budget for the whole scan. */
  timeoutMs?: number;
  maxAttemptsPerTask?: number;
}

interface PipelineStep {
  agentKey: AgentKey;
  title: string;
  /** Scopes that must be selected for this step to run. */
  requiredScopes: DiscoveryScope[];
  /** Steps with no required scopes always run. */
  alwaysRun?: boolean;
}

/** The pipeline. Order is fixed; scope selection decides what actually runs. */
const PIPELINE: PipelineStep[] = [
  {
    agentKey: "WEB_DISCOVERY",
    title: "Discover candidate URLs from configured search providers",
    requiredScopes: ["SEARCH_INDEX"],
  },
  {
    agentKey: "DOMAIN_ENUMERATION",
    title: "Generate and validate candidate domain variations",
    requiredScopes: ["DOMAIN_VARIATIONS", "CERTIFICATE_TRANSPARENCY"],
  },
  {
    agentKey: "WEBSITE_INSPECTION",
    title: "Inspect public page metadata and redirects",
    requiredScopes: ["TECHNICAL_INSPECTION"],
  },
  {
    agentKey: "REGULATORY_VERIFICATION",
    title: "Compare entities against configured official sources",
    requiredScopes: ["REGULATORY_MATCHING"],
  },
  {
    agentKey: "RELATIONSHIP_ANALYSIS",
    title: "Correlate candidates into explainable relationships",
    requiredScopes: ["RELATED_DOMAIN_ANALYSIS"],
  },
  {
    agentKey: "EVIDENCE_REPORTING",
    title: "Consolidate evidence and score completeness",
    requiredScopes: [],
    alwaysRun: true,
  },
];

/** Live state for one running scan, held in process. */
interface RunState {
  scanId: string;
  reference: string;
  status: ScanStatus;
  origin: DataOrigin;
  startedAt: string;
  completedAt: string | null;
  currentAgent: AgentKey | null;
  currentMessage: string | null;
  candidatesFound: number;
  candidatesRequiringReview: number;
  warningCount: number;
  errorMessage: string | null;
  totalSteps: number;
  completedSteps: number;
  controller: AbortController;
  tasks: Map<string, AgentTask>;
  cancelRequested: boolean;
}

const GLOBAL_KEY = "__sentinelScanRuns__";
type GlobalWithRuns = typeof globalThis & { [GLOBAL_KEY]?: Map<string, RunState> };

function runRegistry(): Map<string, RunState> {
  const scope = globalThis as GlobalWithRuns;
  scope[GLOBAL_KEY] ??= new Map<string, RunState>();
  return scope[GLOBAL_KEY];
}

export function getRunState(scanId: string): RunState | undefined {
  return runRegistry().get(scanId);
}

export function countActiveRuns(): number {
  let count = 0;
  for (const run of runRegistry().values()) {
    if (run.status === "QUEUED" || run.status === "RUNNING") count += 1;
  }
  return count;
}

/** Requests cancellation. The pipeline checks between and inside steps. */
export function requestCancellation(scanId: string): boolean {
  const run = runRegistry().get(scanId);
  if (!run) return false;
  if (run.status !== "RUNNING" && run.status !== "QUEUED") return false;
  run.cancelRequested = true;
  run.currentMessage = "Cancellation requested; finishing the current step.";
  run.controller.abort(new Error("Scan cancelled by operator"));
  return true;
}

/**
 * Builds the progress snapshot the UI polls.
 *
 * Reads live in-process state when the scan is running and falls back to the
 * persisted record once it has finished — so a progress request after a
 * server restart returns the stored outcome rather than an error.
 */
export function buildProgress(
  scan: Scan,
  tasks: AgentTask[],
  run: RunState | undefined,
): ScanProgress {
  const relevantTasks = run ? [...run.tasks.values()] : tasks;
  const ordered = [...relevantTasks].sort((a, b) => a.sequence - b.sequence);

  const total = ordered.length || 1;
  const finished = ordered.filter((task) =>
    ["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "SKIPPED", "CANCELLED"].includes(
      task.status,
    ),
  ).length;

  const status = run?.status ?? scan.status;
  const isTerminal = !["QUEUED", "RUNNING"].includes(status);
  const percentComplete = isTerminal ? 100 : Math.min(99, Math.round((finished / total) * 100));

  const startedAt = run?.startedAt ?? scan.startedAt;
  const completedAt = run?.completedAt ?? scan.completedAt ?? scan.cancelledAt;
  const elapsedMs = startedAt
    ? (completedAt ? new Date(completedAt).getTime() : Date.now()) -
      new Date(startedAt).getTime()
    : 0;

  return {
    scanId: scan.id,
    reference: scan.reference,
    status,
    origin: scan.origin,
    isSimulated: scan.origin === "SIMULATED_DEMO",
    percentComplete,
    currentAgent: run?.currentAgent ?? null,
    currentMessage: run?.currentMessage ?? null,
    startedAt,
    completedAt: completedAt ?? null,
    elapsedMs: Math.max(0, elapsedMs),
    candidatesFound: run?.candidatesFound ?? scan.candidatesFound,
    candidatesRequiringReview: run?.candidatesRequiringReview ?? scan.candidatesRequiringReview,
    warningCount: run?.warningCount ?? scan.warningCount,
    errorMessage: run?.errorMessage ?? scan.errorMessage,
    tasks: ordered.map((task) => ({
      id: task.id,
      agentKey: task.agentKey,
      sequence: task.sequence,
      title: task.title,
      status: task.status,
      attempt: task.attempt,
      maxAttempts: task.maxAttempts,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      durationMs: task.durationMs,
      outputSummary: task.outputSummary,
      errorMessage: task.errorMessage,
      hasWarnings: task.hasWarnings,
      metrics: task.metrics,
    })),
  };
}

/**
 * An agent may suggest attention; it may not escalate.
 *
 * HIGH and CRITICAL are reserved for a named human reviewer, so no automated
 * signal can put a domain at the top of an investigator's queue on its own.
 */
function clampAgentPriority(suggested: Priority): Priority {
  return suggested === "CRITICAL" || suggested === "HIGH" ? "MEDIUM" : suggested;
}

export class ScanOrchestrator {
  private readonly repository: SentinelRepository;
  private readonly providers: ProviderRegistry;
  private readonly actor: Pick<User, "id" | "name">;
  private readonly requestId: string;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly run: RunState;
  private readonly scan: Scan;

  /** Normalised FQDN -> domain id, the deduplication index for this run. */
  private readonly domainIdByFqdn = new Map<string, string>();
  private readonly fqdnsNeedingReview = new Set<string>();

  constructor(options: ScanRunOptions) {
    this.repository = options.repository;
    this.providers = options.providers;
    this.actor = options.actor;
    this.requestId = options.requestId;
    this.maxAttempts = options.maxAttemptsPerTask ?? 2;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.scan = options.scan;

    this.run = {
      scanId: options.scan.id,
      reference: options.scan.reference,
      status: "QUEUED",
      origin: options.scan.origin,
      startedAt: new Date().toISOString(),
      completedAt: null,
      currentAgent: null,
      currentMessage: "Queued.",
      candidatesFound: 0,
      candidatesRequiringReview: 0,
      warningCount: 0,
      errorMessage: null,
      totalSteps: 0,
      completedSteps: 0,
      controller: new AbortController(),
      tasks: new Map(),
      cancelRequested: false,
    };
  }

  /** Creates the task plan so the UI can render it before execution starts. */
  async prepare(): Promise<AgentTask[]> {
    const scopes = new Set(this.scan.scopes);
    const steps = PIPELINE.filter(
      (step) => step.alwaysRun || step.requiredScopes.some((scope) => scopes.has(scope)),
    );

    const tasks: AgentTask[] = [];
    for (const [index, step] of steps.entries()) {
      const task = await this.repository.createAgentTask({
        scanId: this.scan.id,
        agentKey: step.agentKey,
        sequence: index + 1,
        title: step.title,
        maxAttempts: this.maxAttempts,
        inputSummary:
          `Seed: ${this.scan.platformNameInput}` +
          (this.scan.seedDomain ? ` (${this.scan.seedDomain})` : ""),
      });
      tasks.push(task);
      this.run.tasks.set(step.agentKey, task);
    }

    this.run.totalSteps = tasks.length;
    runRegistry().set(this.scan.id, this.run);
    return tasks;
  }

  /** Runs the pipeline to completion. Never throws; records outcomes instead. */
  async run_(): Promise<void> {
    const startedAt = new Date().toISOString();
    this.run.status = "RUNNING";
    this.run.startedAt = startedAt;
    this.run.currentMessage = "Starting the agent pipeline.";

    await this.repository.updateScan(this.scan.id, { status: "RUNNING", startedAt });
    await this.audit("SCAN_CREATED", "SCAN", this.scan.id, {
      entityLabel: this.scan.reference,
      newState: { status: "RUNNING" },
      reason: "Agent pipeline started.",
    });

    const overallTimer = setTimeout(() => {
      this.run.controller.abort(new Error("Scan exceeded its overall time budget"));
    }, this.timeoutMs);

    // Accumulated state threaded between steps.
    let discoveredFqdns: string[] = [];
    let inspectionTargets: string[] = [];
    let regulatoryMatchPairs: Array<{ sourceId: string; fqdn: string }> = [];

    try {
      for (const step of PIPELINE) {
        const task = this.run.tasks.get(step.agentKey);
        if (!task) continue;

        if (this.run.cancelRequested) {
          await this.markTask(task, { status: "CANCELLED", outputSummary: "Not started: the scan was cancelled." });
          continue;
        }

        const outcome = await this.executeStep(step, task, {
          discoveredFqdns,
          inspectionTargets,
          regulatoryMatchPairs,
        });

        if (outcome.kind === "cancelled") break;
        if (outcome.kind === "failed") {
          // A failed step does not necessarily end the scan: later steps that
          // can still do useful work are allowed to run. The scan's final
          // status reflects what actually happened.
          continue;
        }

        discoveredFqdns = outcome.discoveredFqdns ?? discoveredFqdns;
        inspectionTargets = outcome.inspectionTargets ?? inspectionTargets;
        regulatoryMatchPairs = outcome.regulatoryMatchPairs ?? regulatoryMatchPairs;
      }
    } finally {
      clearTimeout(overallTimer);
      await this.finalise();
    }
  }

  // --- step execution -----------------------------------------------------

  private async executeStep(
    step: PipelineStep,
    task: AgentTask,
    state: {
      discoveredFqdns: string[];
      inspectionTargets: string[];
      regulatoryMatchPairs: Array<{ sourceId: string; fqdn: string }>;
    },
  ): Promise<{
    kind: "ok" | "failed" | "cancelled";
    discoveredFqdns?: string[];
    inspectionTargets?: string[];
    regulatoryMatchPairs?: Array<{ sourceId: string; fqdn: string }>;
  }> {
    this.run.currentAgent = step.agentKey;
    this.run.currentMessage = `${AGENT_LABELS[step.agentKey]}: ${step.title}`;

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (this.run.cancelRequested) {
        await this.markTask(task, {
          status: "CANCELLED",
          outputSummary: "Cancelled before completion.",
        });
        return { kind: "cancelled" };
      }

      const startedAt = new Date().toISOString();
      await this.markTask(task, { status: "RUNNING", attempt, startedAt, errorMessage: null });
      await this.audit("AGENT_TASK_STARTED", "AGENT_TASK", task.id, {
        entityLabel: `${this.scan.reference} · ${step.agentKey}`,
        newState: { status: "RUNNING", attempt },
      });

      const { context, dispose } = createProviderContext(
        `${this.requestId}:${step.agentKey}:${attempt}`,
        Math.min(this.timeoutMs, 60_000),
        this.run.controller.signal,
      );

      try {
        const result = await this.dispatch(step.agentKey, state, {
          ...context,
          providers: this.providers,
          scanId: this.scan.id,
          scanReference: this.scan.reference,
          scopes: this.scan.scopes,
        });

        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
        const hasWarnings = result.warnings.length > 0;
        if (hasWarnings) this.run.warningCount += result.warnings.length;

        await this.markTask(task, {
          status: hasWarnings ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
          completedAt,
          durationMs,
          outputSummary: result.summary,
          metrics: result.metrics,
          hasWarnings,
          errorMessage: null,
        });
        await this.audit("AGENT_TASK_COMPLETED", "AGENT_TASK", task.id, {
          entityLabel: `${this.scan.reference} · ${step.agentKey}`,
          previousState: { status: "RUNNING" },
          newState: { status: hasWarnings ? "COMPLETED_WITH_WARNINGS" : "COMPLETED", durationMs },
        });

        this.run.completedSteps += 1;
        return { kind: "ok", ...result.state };
      } catch (error) {
        dispose();
        lastError = error;

        if (this.run.cancelRequested || this.run.controller.signal.aborted) {
          await this.markTask(task, {
            status: "CANCELLED",
            completedAt: new Date().toISOString(),
            outputSummary: "Cancelled during execution.",
          });
          return { kind: "cancelled" };
        }

        const retryable = error instanceof AgentExecutionError ? error.retryable : false;
        const isLastAttempt = attempt >= this.maxAttempts || !retryable;

        if (!isLastAttempt) {
          await this.audit("AGENT_TASK_RETRIED", "AGENT_TASK", task.id, {
            entityLabel: `${this.scan.reference} · ${step.agentKey}`,
            previousState: { attempt, status: "FAILED" },
            newState: { attempt: attempt + 1, status: "RUNNING" },
            reason: describeError(error),
          });
          continue;
        }

        const completedAt = new Date().toISOString();
        await this.markTask(task, {
          status: "FAILED",
          completedAt,
          durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          errorMessage: describeError(error),
          outputSummary: "No output was produced; the task failed.",
          hasWarnings: true,
        });
        await this.audit("AGENT_TASK_FAILED", "AGENT_TASK", task.id, {
          entityLabel: `${this.scan.reference} · ${step.agentKey}`,
          previousState: { status: "RUNNING" },
          newState: { status: "FAILED", attempt },
          reason: describeError(error),
        });
        this.run.warningCount += 1;
        return { kind: "failed" };
      } finally {
        dispose();
      }
    }

    this.run.errorMessage = describeError(lastError);
    return { kind: "failed" };
  }

  /** Routes to the right agent and persists whatever it produced. */
  private async dispatch(
    agentKey: AgentKey,
    state: {
      discoveredFqdns: string[];
      inspectionTargets: string[];
      regulatoryMatchPairs: Array<{ sourceId: string; fqdn: string }>;
    },
    context: AgentExecutionContext,
  ): Promise<{
    summary: string;
    metrics: Record<string, number>;
    warnings: Array<{ code: string; message: string }>;
    state: {
      discoveredFqdns?: string[];
      inspectionTargets?: string[];
      regulatoryMatchPairs?: Array<{ sourceId: string; fqdn: string }>;
    };
  }> {
    const observedAt = new Date().toISOString();

    switch (agentKey) {
      case "WEB_DISCOVERY": {
        const output = await this.runTyped(SENTINEL_AGENTS.webDiscovery, context, {
          brand: this.scan.platformNameInput,
          seedDomain: this.scan.seedDomain,
          maxCandidates: this.scan.maxCandidates,
        });
        const fqdns = await this.persistFindings(output.findings, observedAt);
        await this.persistEvidence(output.evidence);
        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: { discoveredFqdns: unique([...state.discoveredFqdns, ...fqdns]) },
        };
      }

      case "DOMAIN_ENUMERATION": {
        const scopes = new Set(this.scan.scopes);
        const output = await this.runTyped(SENTINEL_AGENTS.domainEnumeration, context, {
          brand: this.scan.platformNameInput,
          seedDomain: this.scan.seedDomain,
          knownFqdns: state.discoveredFqdns,
          maxCandidates: this.scan.maxCandidates,
          includeCertificateTransparency: scopes.has("CERTIFICATE_TRANSPARENCY"),
        });
        const fqdns = await this.persistFindings(output.findings, observedAt);
        await this.persistObservations(output.observations);
        await this.persistEvidence(output.evidence);

        // Only hosts that actually resolved are worth inspecting.
        const resolved = output.observations
          .filter((observation) => observation.dnsStatus === "RESOLVED")
          .map((observation) => observation.fqdn);

        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: {
            discoveredFqdns: unique([...state.discoveredFqdns, ...fqdns]),
            inspectionTargets: unique([
              ...state.inspectionTargets,
              ...resolved,
              ...(this.scan.seedDomain ? [this.scan.seedDomain] : []),
            ]),
          },
        };
      }

      case "WEBSITE_INSPECTION": {
        const targets = unique([
          ...state.inspectionTargets,
          ...state.discoveredFqdns,
        ]).slice(0, 40);

        const output = await this.runTyped(SENTINEL_AGENTS.websiteInspection, context, {
          fqdns: targets,
          brand: this.scan.platformNameInput,
          seedDomain: this.scan.seedDomain,
        });
        await this.persistObservations(output.observations);
        await this.persistEvidence(output.evidence);
        await this.persistRelationships(output.relationships);
        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: {},
        };
      }

      case "REGULATORY_VERIFICATION": {
        const sources = await this.repository.listRegulatorySources();
        const candidates = [...this.domainIdByFqdn.entries()]
          .slice(0, 60)
          .map(([fqdn, domainId]) => ({ fqdn, domainId }));

        const output = await this.runTyped(SENTINEL_AGENTS.regulatoryVerification, context, {
          brand: this.scan.platformNameInput,
          candidates,
          sources: sources.map((source) => ({
            sourceId: source.id,
            authorityShortName: source.authorityShortName,
            title: source.title,
            sourceUrl: source.sourceUrl,
            // A source is a fixture only if its host is in the reserved
            // .invalid namespace. Everything else is treated as a real
            // authority whose content must never be simulated.
            isFixtureSource: isFixtureSourceUrl(source.sourceUrl),
            isEnabled: source.isEnabled,
          })),
        });

        for (const check of output.checks) {
          await this.repository.createRegulatorySourceCheck({
            regulatorySourceId: check.sourceId,
            startedAt: check.startedAt,
            completedAt: check.completedAt,
            status: check.status,
            httpStatusCode: check.httpStatusCode,
            bytesRetrieved: check.bytesRetrieved,
            matchedEntityCount: check.matchedEntityCount,
            errorMessage: check.errorMessage,
            note: check.note,
            origin: this.scan.origin,
            triggeredById: this.actor.id,
          });
          await this.repository.updateRegulatorySource(check.sourceId, {
            retrievalStatus: check.status,
            retrievalError: check.errorMessage,
            lastCheckAttemptAt: check.startedAt,
            ...(check.status === "OK" ? { lastSuccessfulCheckAt: check.completedAt } : {}),
          });
          await this.audit("REGULATORY_SOURCE_CHECKED", "REGULATORY_SOURCE", check.sourceId, {
            newState: { status: check.status, matchedEntityCount: check.matchedEntityCount },
            reason: check.errorMessage ?? check.note,
          });
        }

        const matchPairs: Array<{ sourceId: string; fqdn: string }> = [];
        for (const match of output.matches) {
          const created = await this.repository.createRegulatoryMatch({
            regulatorySourceId: match.sourceId,
            domainId: match.domainId,
            matchedTerm: match.matchedTerm,
            matchedContext: match.matchedContext,
            matchType: match.matchType,
            confidence: match.confidence,
            sourceUrl: match.sourceUrl,
            sourceRetrievedAt: match.sourceRetrievedAt,
            notes: match.notes,
            origin: this.scan.origin,
          });
          await this.audit("REGULATORY_MATCH_RECORDED", "REGULATORY_MATCH", created.id, {
            entityLabel: match.matchedTerm,
            newState: { matchType: match.matchType, confidence: match.confidence },
          });
          if (match.fqdn) matchPairs.push({ sourceId: match.sourceId, fqdn: match.fqdn });
        }

        await this.persistEvidence(output.evidence);

        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: {
            regulatoryMatchPairs: unique2(state.regulatoryMatchPairs, matchPairs),
          },
        };
      }

      case "RELATIONSHIP_ANALYSIS": {
        const domains = await Promise.all(
          [...this.domainIdByFqdn.values()].slice(0, 80).map((id) =>
            this.repository.getDomainById(id),
          ),
        );
        const present = domains.filter((domain): domain is NonNullable<typeof domain> =>
          Boolean(domain),
        );

        const output = await this.runTyped(SENTINEL_AGENTS.relationshipAnalysis, context, {
          brand: this.scan.platformNameInput,
          seedDomain: this.scan.seedDomain,
          domains: present.map((domain) => ({
            domainId: domain.id,
            fqdn: domain.fqdn,
            registrableDomain: domain.registrableDomain,
            httpStatusCode: domain.httpStatusCode,
            redirectsToUrl: domain.redirectsToUrl,
            certFingerprintSha256: domain.certFingerprintSha256,
            siteTitle: domain.siteTitle,
            brandSimilarityScore: domain.brandSimilarityScore,
            contentSimilarityScore: domain.contentSimilarityScore,
          })),
          regulatoryMatches: state.regulatoryMatchPairs,
        });

        await this.persistRelationships(output.relationships);
        await this.persistEvidence(output.evidence);
        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: {},
        };
      }

      case "EVIDENCE_REPORTING": {
        const domains = await Promise.all(
          [...this.domainIdByFqdn.values()].map((id) => this.repository.getDomainDetail(id)),
        );
        const present = domains.filter((domain): domain is NonNullable<typeof domain> =>
          Boolean(domain),
        );

        const output = await this.runTyped(SENTINEL_AGENTS.evidenceReporting, context, {
          brand: this.scan.platformNameInput,
          scanReference: this.scan.reference,
          domains: present.map((domain) => ({
            domainId: domain.id,
            fqdn: domain.fqdn,
            evidenceCompleteness: domain.evidenceCompleteness,
            reviewStatus: domain.reviewStatus,
            hasObservedFact: domain.evidence.some((item) => item.kind === "OBSERVED_FACT"),
            hasReviewerAssessment: domain.evidence.some(
              (item) => item.kind === "REVIEWER_ASSESSMENT",
            ),
            regulatoryMatchCount: domain.regulatoryMatchCount,
          })),
        });

        // Apply the suggested priorities, clamped. A domain a human has
        // already triaged is never re-prioritised by an agent.
        for (const assessment of output.assessments) {
          const domain = present.find((item) => item.id === assessment.domainId);
          if (!domain || domain.priority !== "UNTRIAGED") continue;
          const priority = clampAgentPriority(assessment.suggestedPriority);
          if (priority === domain.priority) continue;
          await this.repository.updateDomainReview(domain.id, { priority });
          await this.audit("DOMAIN_UPDATED", "DOMAIN", domain.id, {
            entityLabel: domain.fqdn,
            previousState: { priority: domain.priority },
            newState: { priority },
            reason:
              "Triage priority suggested by the Evidence & Reporting Agent. Agent suggestions " +
              "are capped at MEDIUM; escalation is a human decision.",
          });
        }

        await this.persistEvidence(output.evidence);
        return {
          summary: output.summary,
          metrics: output.metrics,
          warnings: output.warnings,
          state: {},
        };
      }

      default: {
        const exhaustive: never = agentKey;
        throw new Error(`Unhandled agent: ${String(exhaustive)}`);
      }
    }
  }

  private async runTyped<TInput, TOutput>(
    agent: SentinelAgent<TInput, TOutput>,
    context: AgentExecutionContext,
    input: TInput,
  ): Promise<TOutput> {
    return runAgent(agent, input, context);
  }

  // --- persistence --------------------------------------------------------

  /** Upserts findings, deduplicating by normalised FQDN. */
  private async persistFindings(
    findings: Array<{ fqdn: string; sourceKey: string; detail: string | null; observedAt: string }>,
    observedAt: string,
  ): Promise<string[]> {
    const fqdns: string[] = [];

    for (const finding of findings) {
      const parsed = tryNormalizeDomain(finding.fqdn);
      if (!parsed) continue;

      const { domain, created } = await this.repository.upsertDomain({
        fqdn: parsed.fqdn,
        seedPlatformId: this.scan.platformId,
        observedAt: finding.observedAt || observedAt,
        discoveredByScanId: this.scan.id,
        origin: this.scan.origin,
        discoverySources: [
          {
            sourceKey: finding.sourceKey,
            detail: finding.detail,
            observedAt: finding.observedAt || observedAt,
          },
        ],
      });

      const isNew = !this.domainIdByFqdn.has(parsed.fqdn);
      this.domainIdByFqdn.set(parsed.fqdn, domain.id);
      fqdns.push(parsed.fqdn);

      if (created) {
        this.run.candidatesFound += 1;
        await this.audit("DOMAIN_DISCOVERED", "DOMAIN", domain.id, {
          entityLabel: domain.fqdn,
          newState: { fqdn: domain.fqdn, discoverySource: finding.sourceKey },
          reason: finding.detail,
        });
      }
      if (isNew && domain.reviewStatus === "AWAITING_REVIEW") {
        this.fqdnsNeedingReview.add(parsed.fqdn);
        this.run.candidatesRequiringReview = this.fqdnsNeedingReview.size;
      }
    }

    return fqdns;
  }

  private async persistObservations(observations: DomainObservation[]): Promise<void> {
    for (const observation of observations) {
      const parsed = tryNormalizeDomain(observation.fqdn);
      if (!parsed) continue;

      const { domain, created } = await this.repository.upsertDomain({
        fqdn: parsed.fqdn,
        seedPlatformId: this.scan.platformId,
        observedAt: observation.observedAt,
        discoveredByScanId: this.scan.id,
        origin: this.scan.origin,
        dnsStatus: observation.dnsStatus,
        resolvedIpCount: observation.resolvedIpCount,
        httpStatusCode: observation.httpStatusCode,
        redirectsToUrl: observation.redirectsToUrl,
        siteTitle: observation.siteTitle,
        siteDescription: observation.siteDescription,
        siteLanguage: observation.siteLanguage,
        detectedTechnologies: observation.detectedTechnologies,
        certIssuer: observation.certIssuer,
        certSubjectCommonName: observation.certSubjectCommonName,
        certNotBefore: observation.certNotBefore,
        certNotAfter: observation.certNotAfter,
        certFingerprintSha256: observation.certFingerprintSha256,
        brandSimilarityScore: observation.brandSimilarityScore,
        contentSimilarityScore: observation.contentSimilarityScore,
        similarityRationale: observation.similarityRationale,
      });

      if (created) {
        this.run.candidatesFound += 1;
        await this.audit("DOMAIN_DISCOVERED", "DOMAIN", domain.id, {
          entityLabel: domain.fqdn,
          newState: { fqdn: domain.fqdn },
        });
      }
      if (!this.domainIdByFqdn.has(parsed.fqdn)) {
        this.fqdnsNeedingReview.add(parsed.fqdn);
        this.run.candidatesRequiringReview = this.fqdnsNeedingReview.size;
      }
      this.domainIdByFqdn.set(parsed.fqdn, domain.id);
    }
  }

  private async persistEvidence(items: AgentEvidence[]): Promise<void> {
    for (const item of items) {
      const domainId = item.fqdn
        ? (this.domainIdByFqdn.get(tryNormalizeDomain(item.fqdn)?.fqdn ?? item.fqdn) ?? null)
        : null;

      const created = await this.repository.createEvidence({
        domainId,
        scanId: this.scan.id,
        kind: item.kind,
        title: item.title,
        description: item.description,
        sourceUrl: item.sourceUrl,
        sourceLabel: item.sourceLabel,
        collectedAt: item.collectedAt,
        collectionMethod: item.collectionMethod,
        confidence: item.confidence,
        limitations: item.limitations,
        origin: item.origin,
        rawReference: (item.rawReference ?? null) as never,
        createdById: null,
      });

      await this.audit("EVIDENCE_ADDED", "EVIDENCE", created.id, {
        entityLabel: item.title,
        newState: { kind: item.kind, domainId },
      });
    }
  }

  private async persistRelationships(relationships: AgentRelationship[]): Promise<void> {
    for (const relationship of relationships) {
      const sourceId = this.domainIdByFqdn.get(
        tryNormalizeDomain(relationship.sourceFqdn)?.fqdn ?? relationship.sourceFqdn,
      );
      const targetId = this.domainIdByFqdn.get(
        tryNormalizeDomain(relationship.targetFqdn)?.fqdn ?? relationship.targetFqdn,
      );
      if (!sourceId || !targetId || sourceId === targetId) continue;

      const created = await this.repository.upsertRelationship({
        sourceDomainId: sourceId,
        targetDomainId: targetId,
        type: relationship.type,
        confidence: relationship.confidence,
        rationale: relationship.rationale,
        limitations: relationship.limitations,
        relationSource: relationship.relationSource,
        observedAt: relationship.observedAt,
        origin: this.scan.origin,
      });

      await this.audit("RELATIONSHIP_RECORDED", "DOMAIN_RELATIONSHIP", created.id, {
        entityLabel: `${relationship.sourceFqdn} -> ${relationship.targetFqdn}`,
        newState: { type: relationship.type, confidence: relationship.confidence },
        reason: relationship.rationale,
      });
    }
  }

  // --- bookkeeping --------------------------------------------------------

  private async markTask(
    task: AgentTask,
    patch: Partial<{
      status: TaskStatus;
      attempt: number;
      startedAt: string | null;
      completedAt: string | null;
      durationMs: number | null;
      outputSummary: string | null;
      metrics: Record<string, number> | null;
      errorMessage: string | null;
      hasWarnings: boolean;
    }>,
  ): Promise<void> {
    const updated = await this.repository.updateAgentTask(task.id, patch);
    this.run.tasks.set(task.agentKey, updated);
  }

  private async audit(
    action: Parameters<SentinelRepository["appendAuditEvent"]>[0]["action"],
    entityType: Parameters<SentinelRepository["appendAuditEvent"]>[0]["entityType"],
    entityId: string,
    extra: {
      entityLabel?: string | null;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      reason?: string | null;
    } = {},
  ): Promise<void> {
    await this.repository.appendAuditEvent({
      actorId: this.actor.id,
      actorLabel: this.actor.name,
      action,
      entityType,
      entityId,
      entityLabel: extra.entityLabel ?? null,
      previousState: (extra.previousState ?? null) as never,
      newState: (extra.newState ?? null) as never,
      reason: extra.reason ?? null,
      requestId: this.requestId,
    });
  }

  /** Determines and records the scan's final status. */
  private async finalise(): Promise<void> {
    const tasks = [...this.run.tasks.values()];
    const failed = tasks.filter((task) => task.status === "FAILED");
    const cancelled = this.run.cancelRequested;
    const warned = tasks.some((task) => task.status === "COMPLETED_WITH_WARNINGS");
    const succeeded = tasks.filter((task) =>
      ["COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(task.status),
    );

    let status: ScanStatus;
    let errorMessage: string | null = null;

    if (cancelled) {
      status = "CANCELLED";
    } else if (succeeded.length === 0) {
      status = "FAILED";
      errorMessage =
        failed[0]?.errorMessage ??
        "Every agent task failed, so the scan produced no usable output.";
    } else if (failed.length > 0 || warned) {
      status = "COMPLETED_WITH_WARNINGS";
      errorMessage =
        failed.length > 0
          ? `${failed.length} agent task(s) failed. Partial results were kept and the failures are recorded.`
          : null;
    } else {
      status = "COMPLETED";
    }

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(this.run.startedAt).getTime();

    this.run.status = status;
    this.run.completedAt = completedAt;
    this.run.errorMessage = errorMessage;
    this.run.currentAgent = null;
    this.run.currentMessage =
      status === "CANCELLED"
        ? "Cancelled. Results collected before cancellation were kept."
        : `Finished: ${status.toLowerCase().replace(/_/g, " ")}.`;

    await this.repository.updateScan(this.scan.id, {
      status,
      completedAt: status === "CANCELLED" ? null : completedAt,
      cancelledAt: status === "CANCELLED" ? completedAt : null,
      durationMs,
      candidatesFound: this.run.candidatesFound,
      candidatesRequiringReview: this.run.candidatesRequiringReview,
      warningCount: this.run.warningCount,
      errorMessage,
    });

    await this.audit(
      status === "CANCELLED"
        ? "SCAN_CANCELLED"
        : status === "FAILED"
          ? "SCAN_FAILED"
          : "SCAN_COMPLETED",
      "SCAN",
      this.scan.id,
      {
        entityLabel: this.scan.reference,
        previousState: { status: "RUNNING" },
        newState: {
          status,
          candidatesFound: this.run.candidatesFound,
          durationMs,
        },
        reason: errorMessage,
      },
    );

    // Keep the finished run available briefly so a poll in flight still sees
    // the terminal state, then release it.
    setTimeout(() => runRegistry().delete(this.scan.id), 60_000).unref?.();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function unique2(
  existing: Array<{ sourceId: string; fqdn: string }>,
  additions: Array<{ sourceId: string; fqdn: string }>,
): Array<{ sourceId: string; fqdn: string }> {
  const map = new Map<string, { sourceId: string; fqdn: string }>();
  for (const item of [...existing, ...additions]) {
    map.set(`${item.sourceId}:${item.fqdn}`, item);
  }
  return [...map.values()];
}

/**
 * A source is treated as a demonstration fixture only when its hostname is in
 * the reserved `.invalid` namespace. Everything else is a real authority whose
 * content must never be simulated.
 */
export function isFixtureSourceUrl(sourceUrl: string): boolean {
  try {
    return new URL(sourceUrl).hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

function describeError(error: unknown): string {
  if (error instanceof AgentValidationError) return error.message;
  if (error instanceof AgentExecutionError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Reconciles scans left RUNNING by a process that stopped.
 *
 * Without this, a dev-server restart during a scan would leave a row claiming
 * to be running forever — a small lie the UI would faithfully repeat.
 */
export async function reconcileOrphanedScans(
  repository: SentinelRepository,
): Promise<number> {
  const active = await repository.listScans({ status: ["RUNNING", "QUEUED"], pageSize: 100 });
  let reconciled = 0;

  for (const scan of active.items) {
    if (getRunState(scan.id)) continue;

    await repository.updateScan(scan.id, {
      status: "FAILED",
      completedAt: new Date().toISOString(),
      errorMessage:
        "Interrupted: the server stopped while this scan was running. Results collected before " +
        "the interruption were kept. Nothing has been inferred from the interruption.",
    });
    await repository.appendAuditEvent({
      actorId: null,
      actorLabel: "Sentinel orchestrator",
      action: "SCAN_FAILED",
      entityType: "SCAN",
      entityId: scan.id,
      entityLabel: scan.reference,
      previousState: { status: scan.status },
      newState: { status: "FAILED" },
      reason: "Reconciled on startup: no running process owns this scan.",
      requestId: null,
    });

    for (const task of await repository.listAgentTasksForScan(scan.id)) {
      if (task.status === "RUNNING" || task.status === "PENDING") {
        await repository.updateAgentTask(task.id, {
          status: "FAILED",
          completedAt: new Date().toISOString(),
          errorMessage: "Interrupted by a server restart.",
        });
      }
    }
    reconciled += 1;
  }

  return reconciled;
}
