import { NODE_META, numProp, type HldEdge, type HldGraph, type HldNode } from './types';

export interface GraphIndex {
  byId: Map<string, HldNode>;
  out: Map<string, HldEdge[]>;
  inc: Map<string, HldEdge[]>;
  edges: HldEdge[];
}

/** Builds adjacency maps. Edges pointing at unknown nodes are dropped. */
export function indexGraph(g: HldGraph): GraphIndex {
  const byId = new Map<string, HldNode>();
  for (const n of g.nodes) byId.set(n.id, n);
  const out = new Map<string, HldEdge[]>();
  const inc = new Map<string, HldEdge[]>();
  for (const n of g.nodes) {
    out.set(n.id, []);
    inc.set(n.id, []);
  }
  const edges = g.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  for (const e of edges) {
    out.get(e.from)!.push(e);
    inc.get(e.to)!.push(e);
  }
  return { byId, out, inc, edges };
}

export const nodeLatency = (n: HldNode): number => numProp(n, 'latencyMs') ?? NODE_META[n.type].latencyMs;

export interface PathResult {
  path: string[];
  hops: number;
  latencyMs: number;
}

/**
 * Longest simple path that follows only sync edges, starting at any client.
 * `score` decides what "longest" means (hop count or summed latency). Cycles are skipped.
 */
export function longestSyncPath(g: HldGraph, score: 'hops' | 'latency' = 'latency'): PathResult {
  const idx = indexGraph(g);
  let best: PathResult = { path: [], hops: 0, latencyMs: 0 };
  let budget = 50_000; // guards against pathological dense graphs
  const onPath = new Set<string>();
  const path: string[] = [];

  const better = (a: PathResult, b: PathResult) =>
    score === 'hops' ? a.hops > b.hops || (a.hops === b.hops && a.latencyMs > b.latencyMs)
      : a.latencyMs > b.latencyMs || (a.latencyMs === b.latencyMs && a.hops > b.hops);

  const visit = (id: string, lat: number) => {
    if (budget-- <= 0) return;
    onPath.add(id);
    path.push(id);
    const cand = { path: [...path], hops: path.length - 1, latencyMs: lat };
    if (better(cand, best)) best = cand;
    for (const e of idx.out.get(id) ?? []) {
      if (e.kind !== 'sync' || onPath.has(e.to)) continue;
      visit(e.to, lat + nodeLatency(idx.byId.get(e.to)!));
    }
    path.pop();
    onPath.delete(id);
  };

  for (const n of g.nodes) if (n.type === 'client') visit(n.id, nodeLatency(n));
  return best;
}

/** Ids of nodes reachable from any client using sync edges only (the "request path"). */
export function syncReachableFromClients(g: HldGraph): Set<string> {
  const idx = indexGraph(g);
  const seen = new Set<string>();
  const stack = g.nodes.filter((n) => n.type === 'client').map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of idx.out.get(id) ?? []) if (e.kind === 'sync') stack.push(e.to);
  }
  return seen;
}
