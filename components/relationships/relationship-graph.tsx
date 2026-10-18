"use client";

import * as React from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Crosshair, Loader2, Maximize2, RotateCcw, Search, Share2, X } from "lucide-react";

import "@xyflow/react/dist/style.css";

import {
  ConfidenceIndicator,
  DataOriginBadge,
  EvidenceCompletenessMeter,
  PriorityBadge,
  RelationshipTypeBadge,
  ReviewStatusBadge,
} from "@/components/shared/badges";
import { SharedInfrastructureNotice } from "@/components/shared/notices";
import { RelativeTime } from "@/components/shared/relative-time";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useTableState } from "@/components/shared/use-table-state";
import { cn } from "@/lib/utils/cn";
import { RELATIONSHIP_TYPES } from "@/lib/types/enums";
import type { RelationshipType } from "@/lib/types/enums";
import type { RelationshipGraph as GraphData, RelationshipWithEndpoints } from "@/lib/types/views";
import {
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPE_SHORT_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/utils/labels";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Relationship explorer.
 *
 * Nodes are domains, edges are relationships. The node detail panel always
 * shows an edge's `limitations` text alongside its confidence, because a graph
 * is exactly the kind of visualisation that invites reading a line between two
 * things as proof that they are connected.
 */

const EDGE_COLORS: Record<RelationshipType, string> = {
  REDIRECTS_TO: "var(--color-verified)",
  SHARES_CERTIFICATE_CHARACTERISTIC: "var(--color-chart-2)",
  SIMILAR_WEBSITE_CONTENT: "var(--color-chart-1)",
  APPEARS_IN_SAME_OFFICIAL_REPORT: "var(--color-review)",
  SUSPECTED_BRAND_RELATIONSHIP: "var(--color-chart-4)",
  CONFIRMED_RELATIONSHIP: "var(--color-chart-6)",
};

interface DomainNodeData extends Record<string, unknown> {
  fqdn: string;
  reviewStatus: GraphData["nodes"][number]["reviewStatus"];
  priority: GraphData["nodes"][number]["priority"];
  origin: GraphData["nodes"][number]["origin"];
  platformName: string | null;
  evidenceCompleteness: number;
  relationshipCount: number;
  isFocus: boolean;
  isDimmed: boolean;
}

function DomainNode({ data, selected }: NodeProps<Node<DomainNodeData>>) {
  const statusTone =
    data.reviewStatus === "ESCALATED"
      ? "border-critical/60 bg-critical-subtle"
      : data.reviewStatus === "NOT_RELATED" || data.reviewStatus === "DISMISSED"
        ? "border-border bg-muted-subtle"
        : data.reviewStatus === "INCLUDED_IN_REPORT"
          ? "border-verified/60 bg-verified-subtle"
          : data.reviewStatus === "AWAITING_REVIEW"
            ? "border-review/50 bg-review-subtle"
            : "border-accent/50 bg-accent-subtle";

  return (
    <div
      className={cn(
        "min-w-36 max-w-56 rounded-md border px-2.5 py-1.5 shadow-sm transition-all",
        statusTone,
        data.isFocus && "ring-2 ring-accent ring-offset-2 ring-offset-background",
        selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        data.isDimmed && "opacity-25",
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-border-strong" />
      <p className="truncate font-mono text-[11px] font-medium text-foreground" title={data.fqdn}>
        {data.fqdn}
      </p>
      <p className="truncate text-[9px] text-foreground-subtle">
        {REVIEW_STATUS_LABELS[data.reviewStatus]} · {data.relationshipCount} link
        {data.relationshipCount === 1 ? "" : "s"}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-border-strong"
      />
    </div>
  );
}

const NODE_TYPES = { domain: DomainNode };

/**
 * Deterministic radial layout.
 *
 * A force simulation would place the same graph differently on each render,
 * which makes a screenshot impossible to compare. The most-connected node goes
 * in the centre and the rest form rings around it, so the layout is stable.
 */
function layout(graph: GraphData, highlighted: Set<string>): {
  nodes: Node<DomainNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<DomainNodeData>[] = [];
  const centre = graph.nodes.find((node) => node.isFocus) ?? graph.nodes[0];

  const ordered = [...graph.nodes].sort((a, b) => {
    if (a.id === centre?.id) return -1;
    if (b.id === centre?.id) return 1;
    return b.relationshipCount - a.relationshipCount || a.fqdn.localeCompare(b.fqdn);
  });

  const ringSizes = [1, 8, 16, 28, 44];
  let index = 0;

  for (const [ring, capacity] of ringSizes.entries()) {
    const slice = ordered.slice(index, index + capacity);
    if (slice.length === 0) break;
    const radius = ring === 0 ? 0 : 190 + (ring - 1) * 185;

    slice.forEach((node, position) => {
      const angle =
        ring === 0 ? 0 : (position / slice.length) * Math.PI * 2 - Math.PI / 2 + ring * 0.35;

      nodes.push({
        id: node.id,
        type: "domain",
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        },
        data: {
          fqdn: node.fqdn,
          reviewStatus: node.reviewStatus,
          priority: node.priority,
          origin: node.origin,
          platformName: node.platformName,
          evidenceCompleteness: node.evidenceCompleteness,
          relationshipCount: node.relationshipCount,
          isFocus: node.isFocus,
          isDimmed: highlighted.size > 0 && !highlighted.has(node.id),
        },
      });
    });
    index += capacity;
  }

  // Anything beyond the rings is laid out in a grid below.
  ordered.slice(index).forEach((node, position) => {
    nodes.push({
      id: node.id,
      type: "domain",
      position: { x: (position % 10) * 190 - 900, y: 900 + Math.floor(position / 10) * 90 },
      data: {
        fqdn: node.fqdn,
        reviewStatus: node.reviewStatus,
        priority: node.priority,
        origin: node.origin,
        platformName: node.platformName,
        evidenceCompleteness: node.evidenceCompleteness,
        relationshipCount: node.relationshipCount,
        isFocus: node.isFocus,
        isDimmed: highlighted.size > 0 && !highlighted.has(node.id),
      },
    });
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const dimmed =
      highlighted.size > 0 &&
      !(highlighted.has(edge.sourceDomainId) && highlighted.has(edge.targetDomainId));

    return {
      id: edge.id,
      source: edge.sourceDomainId,
      target: edge.targetDomainId,
      label: RELATIONSHIP_TYPE_SHORT_LABELS[edge.type],
      animated: edge.type === "REDIRECTS_TO",
      style: {
        stroke: EDGE_COLORS[edge.type],
        strokeWidth: edge.reviewerConfirmed ? 2 : 1.25,
        strokeDasharray: edge.reviewerConfirmed ? undefined : "4 3",
        opacity: dimmed ? 0.12 : 0.85,
      },
      labelStyle: {
        fill: "var(--color-foreground-muted)",
        fontSize: 9,
        opacity: dimmed ? 0.15 : 1,
      },
      labelBgStyle: { fill: "var(--color-surface)", opacity: dimmed ? 0.15 : 0.9 },
      labelBgPadding: [3, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  return { nodes, edges };
}

export function RelationshipGraphExplorer() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  const table = useTableState();
  const { fitView, setCenter, getNode } = useReactFlow();

  const [graph, setGraph] = React.useState<GraphData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const typeFilter = table.getAll("types");
  const confirmedOnly = table.get("reviewerConfirmedOnly") === "true";

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams(table.values);
    if (!params.has("limit")) params.set("limit", "300");
    return params.toString();
  }, [table.values]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const response = await fetch(`/api/relationships?${queryString}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          setError(
            (payload as { error?: { message?: string } }).error?.message ??
              "The graph could not be loaded.",
          );
          setGraph(null);
          return;
        }
        setGraph((payload as { data: GraphData }).data);
        setError(null);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError("Could not reach the server. Check that it is running and try again.");
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [queryString, reloadToken]);

  // Search highlights matching nodes and dims the rest.
  const highlighted = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2 || !graph) return new Set<string>();
    return new Set(
      graph.nodes
        .filter((node) => node.fqdn.toLowerCase().includes(term))
        .map((node) => node.id),
    );
  }, [searchTerm, graph]);

  const laidOut = React.useMemo(
    () => (graph ? layout(graph, highlighted) : { nodes: [], edges: [] }),
    [graph, highlighted],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<DomainNodeData>>(laidOut.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(laidOut.edges);

  React.useEffect(() => {
    setNodes(laidOut.nodes);
    setEdges(laidOut.edges);
    if (laidOut.nodes.length > 0) {
      // Let React Flow measure before fitting.
      const timer = setTimeout(() => void fitView({ padding: 0.2, duration: 400 }), 60);
      return () => clearTimeout(timer);
    }
  }, [laidOut, setNodes, setEdges, fitView]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdges =
    graph?.edges.filter(
      (edge) => edge.sourceDomainId === selectedNodeId || edge.targetDomainId === selectedNodeId,
    ) ?? [];

  const focusFirstMatch = () => {
    const first = [...highlighted][0];
    if (!first) return;
    const node = getNode(first);
    if (node) {
      void setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 500 });
      setSelectedNodeId(first);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtle"
              aria-hidden="true"
            />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") focusFirstMatch();
              }}
              placeholder="Search for a domain to highlight and focus…"
              className="pl-8"
              aria-label="Search the graph"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-foreground-subtle hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {highlighted.size > 0 ? (
              <Button variant="secondary" size="sm" onClick={focusFirstMatch}>
                <Crosshair aria-hidden="true" />
                Focus ({highlighted.size})
              </Button>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant={typeFilter.length > 0 ? "outline" : "secondary"} size="sm">
                  Relationship type
                  {typeFilter.length > 0 ? (
                    <Badge tone="info" size="sm">
                      {typeFilter.length}
                    </Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80">
                <DropdownMenuLabel>Show relationship types</DropdownMenuLabel>
                {RELATIONSHIP_TYPES.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={typeFilter.includes(type)}
                    onCheckedChange={(checked) =>
                      table.set({
                        types: checked
                          ? [...typeFilter, type]
                          : typeFilter.filter((value) => value !== type),
                      })
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-sm"
                        style={{ backgroundColor: EDGE_COLORS[type] }}
                        aria-hidden="true"
                      />
                      {RELATIONSHIP_TYPE_SHORT_LABELS[type]}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant={confirmedOnly ? "outline" : "secondary"}
              size="sm"
              onClick={() =>
                table.set({ reviewerConfirmedOnly: confirmedOnly ? undefined : "true" })
              }
            >
              Reviewer-confirmed only
            </Button>

            {table.activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => table.clearFilters()}>
                <RotateCcw aria-hidden="true" />
                Clear
              </Button>
            ) : null}

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fitView({ padding: 0.2, duration: 400 })}
            >
              <Maximize2 aria-hidden="true" />
              Fit to view
            </Button>

            {loading ? (
              <Loader2 className="size-3.5 animate-spin text-foreground-subtle" aria-hidden="true" />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {graph?.truncated ? (
        <Alert tone="review" title="The graph is truncated">
          More relationships exist than are shown. Filter by type, or focus on a single domain from
          its detail page, to see the rest.
        </Alert>
      ) : null}

      {error ? (
        <EmptyState
          icon={<Share2 />}
          tone="critical"
          title="The graph could not be loaded"
          description={error}
          action={
            <Button variant="primary" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          }
        />
      ) : graph && graph.nodes.length === 0 && !loading ? (
        <EmptyState
          icon={<Share2 />}
          title={
            table.activeFilterCount > 0
              ? "No relationships match these filters"
              : "No relationships recorded"
          }
          description={
            table.activeFilterCount > 0
              ? "Try removing a relationship-type filter, or turning off reviewer-confirmed only."
              : "Relationships appear once a scan's relationship-analysis step has run, or once a reviewer confirms one. A relationship is a proposed correlation, not proof of a connection."
          }
          action={
            table.activeFilterCount > 0 ? (
              <Button variant="primary" size="sm" onClick={() => table.clearFilters()}>
                Clear filters
              </Button>
            ) : (
              <Button asChild variant="primary" size="sm">
                <Link href="/scans/new">Start a scan</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1fr_22rem]">
          <div className="h-[clamp(24rem,65dvh,48rem)] overflow-hidden rounded-lg border border-border bg-surface-sunken">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={NODE_TYPES}
              onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              proOptions={{ hideAttribution: true }}
              minZoom={0.15}
              maxZoom={2.5}
              fitView
              nodesConnectable={false}
              nodesDraggable
              className="bg-surface-sunken"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="var(--color-border)"
              />
              <Controls
                showInteractive={false}
                className="!border-border !bg-surface [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground-muted [&_button:hover]:!bg-surface-hover"
              />
              <MiniMap
                pannable
                zoomable
                className="!border-border !bg-surface"
                maskColor="color-mix(in oklch, var(--color-background) 70%, transparent)"
                nodeColor={() => "var(--color-accent)"}
              />

              {/* Legend */}
              <Panel position="top-left">
                <div className="max-w-xs rounded-md border border-border bg-surface/95 p-2.5 shadow-sm backdrop-blur">
                  <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Legend
                  </p>
                  <ul className="flex flex-col gap-1">
                    {RELATIONSHIP_TYPES.map((type) => (
                      <li key={type} className="flex items-center gap-1.5">
                        <span
                          className="h-0.5 w-5 shrink-0 rounded-full"
                          style={{ backgroundColor: EDGE_COLORS[type] }}
                          aria-hidden="true"
                        />
                        <span className="text-[10px] text-foreground-muted">
                          {RELATIONSHIP_TYPE_SHORT_LABELS[type]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-border pt-1.5 text-[9px] leading-relaxed text-foreground-subtle">
                    Solid line = reviewer-confirmed. Dashed = proposed. Click a node for its
                    relationships and what each one does not establish.
                  </p>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Node detail panel */}
          <div className="flex flex-col gap-3">
            {selectedNode ? (
              <Card>
                <CardContent className="flex flex-col gap-3 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-semibold text-foreground">
                        {selectedNode.fqdn}
                      </p>
                      {selectedNode.platformName ? (
                        <p className="pt-0.5 text-[10px] text-foreground-subtle">
                          {selectedNode.platformName}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSelectedNodeId(null)}
                      aria-label="Close node details"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <ReviewStatusBadge status={selectedNode.reviewStatus} />
                    <PriorityBadge priority={selectedNode.priority} />
                    <DataOriginBadge origin={selectedNode.origin} compact />
                  </div>

                  <EvidenceCompletenessMeter percent={selectedNode.evidenceCompleteness} />

                  <Button asChild variant="primary" size="sm">
                    <Link href={`/domains/${selectedNode.id}`}>Open domain detail</Link>
                  </Button>

                  <div>
                    <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                      {selectedEdges.length} relationship{selectedEdges.length === 1 ? "" : "s"}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {selectedEdges.map((edge) => (
                        <EdgeDetail key={edge.id} edge={edge} currentId={selectedNode.id} />
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <EmptyState
                    icon={<Crosshair />}
                    title="Select a node"
                    description="Click any domain in the graph to see its relationships, each one's confidence, and — importantly — what it does not establish."
                    className="border-0 bg-transparent py-2"
                  />
                </CardContent>
              </Card>
            )}

            <SharedInfrastructureNotice />

            <Card>
              <CardContent className="py-3">
                <p className="text-[10px] leading-relaxed text-foreground-subtle">
                  <strong className="text-foreground-muted">Reading this graph.</strong> An edge
                  records a correlation someone or something observed, with a confidence score. It
                  is not proof that two sites are operated by the same party. Seeded relationships
                  in the demo dataset are illustrative and were not collected from any real
                  website.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeDetail({
  edge,
  currentId,
}: {
  edge: RelationshipWithEndpoints;
  currentId: string;
}) {
  const isOutgoing = edge.sourceDomainId === currentId;
  const other = isOutgoing ? edge.targetDomain : edge.sourceDomain;

  return (
    <li className="rounded-md border border-border bg-surface-sunken/60 p-2">
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        <RelationshipTypeBadge type={edge.type} />
        {edge.reviewerConfirmed ? (
          <Badge tone="verified" size="sm">
            Confirmed
          </Badge>
        ) : (
          <Badge tone="muted" size="sm">
            Proposed
          </Badge>
        )}
        <ConfidenceIndicator value={edge.confidence} />
      </div>

      <p className="text-[10px] text-foreground-muted">
        {isOutgoing ? "→" : "←"}{" "}
        <Link href={`/domains/${other.id}`} className="font-mono text-accent hover:underline">
          {other.fqdn}
        </Link>
      </p>

      <Tooltip content={RELATIONSHIP_TYPE_LABELS[edge.type]}>
        <p className="cursor-help pt-1 text-[10px] leading-relaxed text-foreground-muted">
          {edge.rationale}
        </p>
      </Tooltip>

      <p className="mt-1.5 rounded border border-review/30 bg-review-subtle/40 px-1.5 py-1 text-[9px] leading-relaxed text-review-foreground">
        <strong>Does not establish:</strong> {edge.limitations}
      </p>

      <p className="pt-1 text-[9px] text-foreground-subtle">
        {edge.relationSource} ·{" "}
        <Tooltip content={formatDateTime(edge.lastObservedAt)}>
          <span className="cursor-help">
            last observed <RelativeTime value={edge.lastObservedAt} />
          </span>
        </Tooltip>
      </p>
    </li>
  );
}
