export interface ConsistentHashParams {
  nodes: number;
  vnodes: number;
  keys: number;
}

export type HashOp = 'add' | 'remove';

export const CH_DEFAULTS: ConsistentHashParams = { nodes: 5, vnodes: 100, keys: 10000 };
export const CH_DEFAULT_OPS: HashOp[] = ['add', 'add', 'remove', 'add', 'remove', 'remove', 'add', 'add'];

/** FNV-1a 32-bit followed by a murmur3 finaliser for better bit mixing. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class HashRing {
  private points: { h: number; node: string }[] = [];
  constructor(nodes: string[], vnodes: number) {
    const v = Math.max(1, Math.round(vnodes));
    for (const node of nodes) for (let i = 0; i < v; i++) this.points.push({ h: hash32(`${node}#${i}`), node });
    this.points.sort((a, b) => a.h - b.h || a.node.localeCompare(b.node));
  }
  lookup(key: string): string {
    const h = hash32(key);
    const pts = this.points;
    let lo = 0;
    let hi = pts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].h < h) lo = mid + 1;
      else hi = mid;
    }
    return pts[lo % pts.length].node;
  }
}

export interface HashStep {
  op: HashOp | 'start';
  nodes: string[];
  movedConsistent: number; // share of keys that changed owner
  movedModulo: number;
  /** Ideal share for consistent hashing: 1/N_after for add, 1/N_before for remove. */
  ideal: number;
  /** Keys per node (consistent hashing) after this step. */
  distribution: { node: string; keys: number }[];
  /** Busiest node's keys ÷ average keys per node. 1.0 = perfectly even. */
  maxOverAvg: number;
}

function assign(keys: string[], nodes: string[], vnodes: number) {
  const ring = new HashRing(nodes, vnodes);
  const ch = keys.map((k) => ring.lookup(k));
  const mod = keys.map((k) => nodes[hash32(k) % nodes.length]);
  return { ch, mod };
}

export function simulateConsistentHash(p: ConsistentHashParams, ops: HashOp[]): HashStep[] {
  const keys = Array.from({ length: Math.max(1, Math.round(p.keys)) }, (_, i) => `key-${i}`);
  let nextId = Math.max(1, Math.round(p.nodes));
  let nodes = Array.from({ length: nextId }, (_, i) => `node-${i}`);
  let prev = assign(keys, nodes, p.vnodes);
  const steps: HashStep[] = [];

  const describe = (op: HashStep['op'], moved: { ch: number; mod: number }, ideal: number, a: { ch: string[] }) => {
    const counts = new Map(nodes.map((n) => [n, 0]));
    for (const o of a.ch) counts.set(o, (counts.get(o) ?? 0) + 1);
    const distribution = nodes.map((node) => ({ node, keys: counts.get(node) ?? 0 }));
    const avg = keys.length / nodes.length;
    steps.push({ op, nodes: [...nodes], movedConsistent: moved.ch, movedModulo: moved.mod, ideal, distribution, maxOverAvg: Math.max(...distribution.map((d) => d.keys)) / avg });
  };
  describe('start', { ch: 0, mod: 0 }, 0, prev);

  for (const op of ops) {
    const before = nodes.length;
    if (op === 'add') nodes = [...nodes, `node-${nextId++}`];
    else if (nodes.length > 1) nodes = nodes.slice(0, -1);
    else continue;
    const next = assign(keys, nodes, p.vnodes);
    let mc = 0;
    let mm = 0;
    for (let i = 0; i < keys.length; i++) {
      if (next.ch[i] !== prev.ch[i]) mc++;
      if (next.mod[i] !== prev.mod[i]) mm++;
    }
    const ideal = op === 'add' ? 1 / nodes.length : 1 / before;
    describe(op, { ch: mc / keys.length, mod: mm / keys.length }, ideal, next);
    prev = next;
  }
  return steps;
}
