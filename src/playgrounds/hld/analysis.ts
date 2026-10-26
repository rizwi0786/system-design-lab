import { longestSyncPath, nodeLatency } from './graph';
import { isNodeType, NODE_META, numProp, type HldEdge, type HldGraph, type HldNode, type HldNodeType, type HldPropValue } from './types';

// ---------- Parsing / import ----------

export type ParseResult = { ok: true; graph: HldGraph } | { ok: false; error: string };

/** Validates untrusted JSON (import box, lesson content) into an HldGraph. */
export function parseHldGraph(input: unknown): ParseResult {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
    }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'Expected an object with "nodes" and "edges".' };
  const d = data as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(d.nodes)) return { ok: false, error: '"nodes" must be an array.' };
  const edgesIn = d.edges === undefined ? [] : d.edges;
  if (!Array.isArray(edgesIn)) return { ok: false, error: '"edges" must be an array.' };

  const nodes: HldNode[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of d.nodes.entries()) {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r.id !== 'string' || !r.id) return { ok: false, error: `Node ${i} needs a string "id".` };
    if (ids.has(r.id)) return { ok: false, error: `Duplicate node id "${r.id}".` };
    if (!isNodeType(r.type)) return { ok: false, error: `Node "${r.id}" has unknown type "${String(r.type)}".` };
    ids.add(r.id);
    const node: HldNode = { id: r.id, type: r.type, label: typeof r.label === 'string' ? r.label : NODE_META[r.type].label };
    if (r.props && typeof r.props === 'object') {
      const props: Record<string, HldPropValue> = {};
      for (const [k, v] of Object.entries(r.props as Record<string, unknown>)) {
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') props[k] = v;
      }
      node.props = props;
    }
    const p = r.position as { x?: unknown; y?: unknown } | undefined;
    if (p && typeof p.x === 'number' && typeof p.y === 'number') node.position = { x: p.x, y: p.y };
    nodes.push(node);
  }

  const edges: HldEdge[] = [];
  for (const [i, raw] of edgesIn.entries()) {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r.from !== 'string' || typeof r.to !== 'string') return { ok: false, error: `Edge ${i} needs "from" and "to".` };
    if (!ids.has(r.from) || !ids.has(r.to)) return { ok: false, error: `Edge ${i} (${r.from} → ${r.to}) points at a missing node.` };
    const edge: HldEdge = { from: r.from, to: r.to, kind: r.kind === 'async' ? 'async' : 'sync' };
    if (typeof r.id === 'string') edge.id = r.id;
    if (typeof r.label === 'string' && r.label) edge.label = r.label;
    edges.push(edge);
  }
  return { ok: true, graph: { nodes, edges } };
}

// ---------- Layout ----------

/** Gives every node without a position a layered left-to-right position (rank = longest path from a source). */
export function autoLayout(g: HldGraph): HldGraph {
  if (g.nodes.every((n) => n.position)) return g;
  const rank = new Map<string, number>(g.nodes.map((n) => [n.id, 0]));
  // Bellman-Ford style relaxation capped at node count (cycles just stop growing).
  for (let i = 0; i < g.nodes.length; i++) {
    let changed = false;
    for (const e of g.edges) {
      const r = (rank.get(e.from) ?? 0) + 1;
      if (rank.has(e.to) && r > rank.get(e.to)! && r < g.nodes.length) {
        rank.set(e.to, r);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, number>();
  const nodes = g.nodes.map((n) => {
    if (n.position) return n;
    const r = rank.get(n.id) ?? 0;
    const row = rows.get(r) ?? 0;
    rows.set(r, row + 1);
    return { ...n, position: { x: 40 + r * 230, y: 40 + row * 120 } };
  });
  return { ...g, nodes };
}

// ---------- Mermaid ----------

const mermaidId = (id: string) => 'n_' + id.replace(/[^A-Za-z0-9_]/g, '_');
const mermaidText = (s: string) => s.replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');

function mermaidShape(type: HldNodeType, text: string): string {
  const t = `"${text}"`;
  switch (type) {
    case 'database':
    case 'read-replica':
      return `[(${t})]`;
    case 'client':
      return `([${t}])`;
    case 'queue':
    case 'stream':
      return `>${t}]`;
    case 'cache':
      return `[/${t}/]`;
    case 'external':
      return `{{${t}}}`;
    default:
      return `[${t}]`;
  }
}

/** Mermaid flowchart text. Sync edges are solid arrows, async edges dotted. */
export function toMermaid(g: HldGraph): string {
  const lines = ['flowchart LR'];
  for (const n of g.nodes) lines.push(`  ${mermaidId(n.id)}${mermaidShape(n.type, mermaidText(n.label || n.id))}`);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const arrow = e.kind === 'async' ? '-.->' : '-->';
    const label = e.label ? `|"${mermaidText(e.label)}"|` : '';
    lines.push(`  ${mermaidId(e.from)} ${arrow}${label} ${mermaidId(e.to)}`);
  }
  return lines.join('\n');
}

// ---------- Compare ----------

export interface TypeDiff {
  type: HldNodeType;
  yours: number;
  reference: number;
}

export interface GraphComparison {
  sharedTypes: HldNodeType[];
  missingTypes: TypeDiff[]; // in reference, not (enough) in yours
  extraTypes: TypeDiff[]; // in yours, not in reference
  missingEdges: string[]; // "client → load-balancer (sync)"
  extraEdges: string[];
}

const countBy = <T,>(xs: T[]) => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

function edgeSignatures(g: HldGraph): string[] {
  const t = new Map(g.nodes.map((n) => [n.id, n.type]));
  return g.edges
    .filter((e) => t.has(e.from) && t.has(e.to))
    .map((e) => `${t.get(e.from)} → ${t.get(e.to)} (${e.kind})`);
}

/** Compares by component type and type-to-type connection, since ids differ between designs. */
export function compareGraphs(yours: HldGraph, reference: HldGraph): GraphComparison {
  const y = countBy(yours.nodes.map((n) => n.type));
  const r = countBy(reference.nodes.map((n) => n.type));
  const sharedTypes: HldNodeType[] = [];
  const missingTypes: TypeDiff[] = [];
  const extraTypes: TypeDiff[] = [];
  for (const [type, rc] of r) {
    const yc = y.get(type) ?? 0;
    if (yc > 0) sharedTypes.push(type);
    if (yc === 0) missingTypes.push({ type, yours: yc, reference: rc });
  }
  for (const [type, yc] of y) if (!r.has(type)) extraTypes.push({ type, yours: yc, reference: 0 });

  const ye = countBy(edgeSignatures(yours));
  const re = countBy(edgeSignatures(reference));
  const missingEdges: string[] = [];
  const extraEdges: string[] = [];
  for (const [sig, rc] of re) if ((ye.get(sig) ?? 0) === 0 && rc > 0) missingEdges.push(sig);
  for (const [sig] of ye) if (!re.has(sig)) extraEdges.push(sig);
  const byOrder = (a: string, b: string) => a.localeCompare(b);
  return {
    sharedTypes: sharedTypes.sort(byOrder),
    missingTypes: missingTypes.sort((a, b) => a.type.localeCompare(b.type)),
    extraTypes: extraTypes.sort((a, b) => a.type.localeCompare(b.type)),
    missingEdges: missingEdges.sort(byOrder),
    extraEdges: extraEdges.sort(byOrder),
  };
}

// ---------- Traffic / latency ----------

export interface TrafficSummary {
  clientRps: number;
  path: { id: string; label: string; latencyMs: number }[];
  totalLatencyMs: number;
  hops: number;
}

export function trafficSummary(g: HldGraph): TrafficSummary {
  const clientRps = g.nodes.filter((n) => n.type === 'client').reduce((s, n) => s + (numProp(n, 'rps') ?? 0), 0);
  const best = longestSyncPath(g, 'latency');
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const path = best.path.map((id) => {
    const n = byId.get(id)!;
    return { id, label: n.label || n.id, latencyMs: nodeLatency(n) };
  });
  return { clientRps, path, totalLatencyMs: best.latencyMs, hops: best.hops };
}
