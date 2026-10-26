import { describe, expect, it } from 'vitest';
import { validateHld } from './validate';
import { HLD_TEMPLATES } from './templates';
import type { HldEdge, HldGraph, HldNode } from './types';

const n = (id: string, type: HldNode['type'], props?: HldNode['props']): HldNode => ({ id, type, label: id, props });
const e = (from: string, to: string, kind: HldEdge['kind'] = 'sync', label?: string): HldEdge => ({ from, to, kind, label });
const ids = (g: HldGraph) => validateHld(g).map((f) => f.id);
const has = (g: HldGraph, id: string) => ids(g).includes(id);

// A healthy baseline that should produce no findings at all.
const healthy = (): HldGraph => ({
  nodes: [
    n('c', 'client', { rps: 100 }),
    n('lb', 'load-balancer', { multiAz: true }),
    n('api', 'app-server', { instances: 3 }),
    n('db', 'database', { replicas: 2 }),
    n('mon', 'monitoring'),
  ],
  edges: [e('c', 'lb'), e('lb', 'api'), e('api', 'db'), e('api', 'mon', 'async')],
});

describe('validateHld', () => {
  it('returns nothing for a healthy design', () => {
    expect(validateHld(healthy())).toEqual([]);
  });

  it('returns no findings for an empty graph', () => {
    expect(validateHld({ nodes: [], edges: [] })).toEqual([]);
  });

  it('is deterministic', () => {
    for (const t of HLD_TEMPLATES) expect(validateHld(t.graph)).toEqual(validateHld(structuredClone(t.graph)));
  });

  it('flags single points of failure unless replicated or multi-AZ', () => {
    const g = healthy();
    g.nodes[2] = n('api', 'app-server', { instances: 1 });
    expect(validateHld(g).find((f) => f.id === 'spof:api')?.severity).toBe('warning');
    g.nodes[2] = n('api', 'app-server', { instances: 1, multiAz: true });
    expect(has(g, 'spof:api')).toBe(false);
    g.nodes[3] = n('db', 'database');
    expect(has(g, 'spof:db')).toBe(true);
  });

  it('flags a client talking to the database as an error', () => {
    const g = healthy();
    g.edges.push(e('c', 'db'));
    const f = validateHld(g).find((x) => x.id === 'client-db:c->db');
    expect(f?.severity).toBe('error');
    expect(f?.nodeIds).toEqual(['c', 'db']);
  });

  it('flags a database with no app server or worker in front', () => {
    const g: HldGraph = {
      nodes: [n('c', 'client'), n('db', 'database', { replicas: 2 }), n('mon', 'monitoring')],
      edges: [e('c', 'db'), e('db', 'mon', 'async')],
    };
    expect(validateHld(g).find((f) => f.id === 'db-unfronted:db')?.severity).toBe('error');
    const w: HldGraph = { ...g, nodes: [...g.nodes, n('w', 'worker')], edges: [...g.edges, e('w', 'db')] };
    expect(has(w, 'db-unfronted:db')).toBe(false);
  });

  it('flags sync chains deeper than 4 hops as a trade-off, ignoring async edges', () => {
    const chain: HldGraph = {
      nodes: [n('c', 'client'), n('a', 'api-gateway'), n('b', 'rate-limiter'), n('s1', 'app-server', { instances: 2 }), n('s2', 'app-server', { instances: 2 }), n('d', 'database', { replicas: 2 }), n('mon', 'monitoring')],
      edges: [e('c', 'a'), e('a', 'b'), e('b', 's1'), e('s1', 's2'), e('s2', 'd'), e('d', 'mon', 'async')],
    };
    const f = validateHld(chain).find((x) => x.id === 'deep-sync-chain');
    expect(f?.severity).toBe('tradeoff');
    expect(f?.nodeIds).toEqual(['c', 'a', 'b', 's1', 's2', 'd']);
    chain.edges[4] = e('s2', 'd', 'async');
    expect(has(chain, 'deep-sync-chain')).toBe(false); // now exactly 4 sync hops
  });

  it('handles cycles without hanging', () => {
    const g: HldGraph = { nodes: [n('c', 'client'), n('a', 'app-server', { instances: 2 }), n('b', 'app-server', { instances: 2 })], edges: [e('c', 'a'), e('a', 'b'), e('b', 'a')] };
    expect(() => validateHld(g)).not.toThrow();
  });

  it('notes a cache that nothing reads through', () => {
    const g = healthy();
    g.nodes.push(n('cache', 'cache', { replicas: 2 }));
    g.edges.push(e('cache', 'mon', 'async'));
    expect(validateHld(g).find((f) => f.id === 'cache-unused:cache')?.severity).toBe('info');
    g.edges.push(e('api', 'cache'));
    expect(has(g, 'cache-unused:cache')).toBe(false);
  });

  it('flags a queue with producers but no consumer, and notes missing DLQ', () => {
    const g = healthy();
    g.nodes.push(n('q', 'queue'));
    g.edges.push(e('api', 'q', 'async'));
    expect(validateHld(g).find((f) => f.id === 'queue-no-consumer:q')?.severity).toBe('error');
    expect(validateHld(g).find((f) => f.id === 'queue-no-dlq:q')?.severity).toBe('info');
    g.nodes.push(n('w', 'worker'));
    g.edges.push(e('q', 'w', 'async'));
    expect(has(g, 'queue-no-consumer:q')).toBe(false);
    g.nodes.push(n('dlq', 'queue', { dlq: true }));
    g.edges.push(e('q', 'dlq', 'async'));
    expect(has(g, 'queue-no-dlq:q')).toBe(false);
    expect(has(g, 'queue-no-dlq:dlq')).toBe(false);
  });

  it('accepts the dlq prop as a dead-letter plan', () => {
    const g = healthy();
    g.nodes.push(n('q', 'queue', { dlq: true }), n('w', 'worker'));
    g.edges.push(e('api', 'q', 'async'), e('q', 'w', 'async'));
    expect(ids(g).filter((x) => x.includes(':q'))).toEqual([]);
  });

  it('notes a missing monitoring node', () => {
    const g = healthy();
    g.nodes = g.nodes.filter((x) => x.id !== 'mon');
    g.edges = g.edges.filter((x) => x.to !== 'mon');
    expect(validateHld(g).find((f) => f.id === 'no-monitoring')?.severity).toBe('info');
  });

  it('flags a synchronous external call on the request path, but not an async one', () => {
    const g = healthy();
    g.nodes.push(n('pay', 'external'));
    g.edges.push(e('api', 'pay'));
    const f = validateHld(g).find((x) => x.id === 'external-sync:pay');
    expect(f?.severity).toBe('tradeoff');
    expect(f?.nodeIds).toEqual(['pay', 'api']);
    g.edges[g.edges.length - 1] = e('api', 'pay', 'async');
    expect(has(g, 'external-sync:pay')).toBe(false);
  });

  it('does not flag an external call made by a background worker', () => {
    const g = healthy();
    g.nodes.push(n('q', 'queue', { dlq: true }), n('w', 'worker'), n('mail', 'external'));
    g.edges.push(e('api', 'q', 'async'), e('q', 'w', 'async'), e('w', 'mail'));
    expect(has(g, 'external-sync:mail')).toBe(false);
  });

  it('flags object storage served directly to clients', () => {
    const g = healthy();
    g.nodes.push(n('s3', 'object-storage'));
    g.edges.push(e('c', 's3'));
    expect(validateHld(g).find((f) => f.id === 'storage-no-cdn:c->s3')?.severity).toBe('tradeoff');
  });

  it('flags writes to a read replica but allows reads and replication', () => {
    const g = healthy();
    g.nodes.push(n('rr', 'read-replica'));
    g.edges.push(e('db', 'rr', 'async', 'replication'), e('api', 'rr', 'sync', 'read'));
    expect(ids(g).some((x) => x.startsWith('replica-write'))).toBe(false);
    g.edges.push(e('api', 'rr', 'sync', 'write order'));
    expect(validateHld(g).find((f) => f.id === 'replica-write:api->rr')?.severity).toBe('error');
  });

  it('flags stateful app servers behind a non-sticky load balancer', () => {
    const g = healthy();
    g.nodes[2] = n('api', 'app-server', { instances: 3, stateful: true });
    expect(validateHld(g).find((f) => f.id === 'stateful-behind-lb:api')?.severity).toBe('warning');
    g.nodes[1] = n('lb', 'load-balancer', { multiAz: true, sticky: true });
    expect(has(g, 'stateful-behind-lb:api')).toBe(false);
    g.nodes[1] = n('lb', 'load-balancer', { multiAz: true });
    g.nodes[2] = n('api', 'app-server', { instances: 3, stateful: true, sharedSession: true });
    expect(has(g, 'stateful-behind-lb:api')).toBe(false);
  });

  it('flags isolated nodes', () => {
    const g = healthy();
    g.nodes.push(n('search', 'search'));
    expect(validateHld(g).find((f) => f.id === 'isolated:search')?.severity).toBe('warning');
  });

  it('ignores edges that point at missing nodes', () => {
    const g = healthy();
    g.edges.push(e('api', 'ghost'));
    expect(validateHld(g)).toEqual([]);
  });

  it('every finding explains why', () => {
    const g: HldGraph = {
      nodes: [n('c', 'client'), n('db', 'database'), n('q', 'queue'), n('x', 'cache'), n('lonely', 'search')],
      edges: [e('c', 'db'), e('c', 'q', 'async'), e('x', 'db')],
    };
    const fs = validateHld(g);
    expect(fs.length).toBeGreaterThan(4);
    for (const f of fs) expect(f.detail.length).toBeGreaterThan(60);
    expect(new Set(fs.map((f) => f.id)).size).toBe(fs.length);
  });

  it('starter templates other than blank have no definite errors', () => {
    for (const t of HLD_TEMPLATES) {
      expect(validateHld(t.graph).filter((f) => f.severity === 'error'), t.id).toEqual([]);
    }
  });
});
