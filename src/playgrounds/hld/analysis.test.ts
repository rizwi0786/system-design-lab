import { describe, expect, it } from 'vitest';
import { autoLayout, compareGraphs, parseHldGraph, toMermaid, trafficSummary } from './analysis';
import type { HldGraph } from './types';

const doc: HldGraph = {
  nodes: [
    { id: 'c', type: 'client', label: 'Mobile app', props: { rps: 2000 } },
    { id: 'lb', type: 'load-balancer', label: 'ALB' },
    { id: 'api', type: 'app-server', label: 'API', props: { instances: 3 } },
    { id: 'db', type: 'database', label: 'PostgreSQL', props: { replicas: 1 } },
  ],
  edges: [
    { from: 'c', to: 'lb', kind: 'sync' },
    { from: 'lb', to: 'api', kind: 'sync' },
    { from: 'api', to: 'db', kind: 'sync', label: 'SQL' },
  ],
};

describe('parseHldGraph', () => {
  it('accepts the documented format (object or string)', () => {
    expect(parseHldGraph(doc)).toEqual({ ok: true, graph: doc });
    expect(parseHldGraph(JSON.stringify(doc)).ok).toBe(true);
  });
  it('rejects bad input with a readable message', () => {
    expect(parseHldGraph('{nope')).toMatchObject({ ok: false });
    expect(parseHldGraph({ nodes: [{ id: 'a', type: 'mainframe' }] })).toMatchObject({ ok: false, error: expect.stringContaining('unknown type') });
    expect(parseHldGraph({ nodes: [{ id: 'a', type: 'cache' }], edges: [{ from: 'a', to: 'b' }] })).toMatchObject({ ok: false, error: expect.stringContaining('missing node') });
    expect(parseHldGraph({ nodes: [{ id: 'a', type: 'cache' }, { id: 'a', type: 'cache' }] })).toMatchObject({ ok: false, error: expect.stringContaining('Duplicate') });
  });
  it('defaults missing edge kind to sync and missing label to the type name', () => {
    const r = parseHldGraph({ nodes: [{ id: 'a', type: 'cache' }, { id: 'b', type: 'database' }], edges: [{ from: 'a', to: 'b' }] });
    expect(r.ok && r.graph.edges[0].kind).toBe('sync');
    expect(r.ok && r.graph.nodes[0].label).toBe('Cache');
  });
});

describe('toMermaid', () => {
  it('renders shapes, sync and async arrows and escapes quotes', () => {
    const g: HldGraph = {
      nodes: [...doc.nodes, { id: 'q-1', type: 'queue', label: 'Jobs "fast"' }],
      edges: [...doc.edges, { from: 'api', to: 'q-1', kind: 'async' }],
    };
    const m = toMermaid(g);
    expect(m.split('\n')[0]).toBe('flowchart LR');
    expect(m).toContain('n_db[("PostgreSQL")]');
    expect(m).toContain('n_c(["Mobile app"])');
    expect(m).toContain('n_api -->|"SQL"| n_db');
    expect(m).toContain('n_api -.-> n_q_1');
    expect(m).toContain('#quot;fast#quot;');
  });
});

describe('compareGraphs', () => {
  it('reports differences by type and connection', () => {
    const yours: HldGraph = {
      nodes: [{ id: 'x', type: 'client', label: 'x' }, { id: 'y', type: 'app-server', label: 'y' }, { id: 'z', type: 'database', label: 'z' }, { id: 's', type: 'search', label: 's' }],
      edges: [{ from: 'x', to: 'y', kind: 'sync' }, { from: 'y', to: 'z', kind: 'sync' }],
    };
    const c = compareGraphs(yours, doc);
    expect(c.sharedTypes).toEqual(['app-server', 'client', 'database']);
    expect(c.missingTypes.map((d) => d.type)).toEqual(['load-balancer']);
    expect(c.extraTypes.map((d) => d.type)).toEqual(['search']);
    expect(c.missingEdges).toEqual(['client → load-balancer (sync)', 'load-balancer → app-server (sync)']);
    expect(c.extraEdges).toEqual(['client → app-server (sync)']);
  });
  it('finds no differences against itself', () => {
    const c = compareGraphs(doc, doc);
    expect([c.missingTypes, c.extraTypes, c.missingEdges, c.extraEdges].every((x) => x.length === 0)).toBe(true);
  });
});

describe('trafficSummary', () => {
  it('sums illustrative default latencies along the longest sync path and client rps', () => {
    const t = trafficSummary(doc);
    expect(t.clientRps).toBe(2000);
    expect(t.path.map((p) => p.id)).toEqual(['c', 'lb', 'api', 'db']);
    expect(t.totalLatencyMs).toBe(0 + 2 + 20 + 10);
    expect(t.hops).toBe(3);
  });
  it('uses latencyMs overrides and skips async edges', () => {
    const g: HldGraph = {
      ...doc,
      nodes: [...doc.nodes, { id: 'ext', type: 'external', label: 'ext', props: { latencyMs: 500 } }],
      edges: [...doc.edges, { from: 'api', to: 'ext', kind: 'async' }],
    };
    expect(trafficSummary(g).totalLatencyMs).toBe(32);
    g.edges[3] = { from: 'api', to: 'ext', kind: 'sync' };
    expect(trafficSummary(g).totalLatencyMs).toBe(522);
  });
});

describe('autoLayout', () => {
  it('places nodes in left-to-right layers by dependency depth', () => {
    const laid = autoLayout(doc);
    const x = (id: string) => laid.nodes.find((n) => n.id === id)!.position!.x;
    expect(x('c')).toBeLessThan(x('lb'));
    expect(x('lb')).toBeLessThan(x('api'));
    expect(x('api')).toBeLessThan(x('db'));
  });
  it('keeps existing positions', () => {
    const g: HldGraph = { nodes: [{ id: 'a', type: 'cache', label: 'a', position: { x: 5, y: 6 } }], edges: [] };
    expect(autoLayout(g)).toBe(g);
  });
});
