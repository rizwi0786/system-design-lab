// Parsing for the visual lesson directives (:::flow, :::steps, :::compare, :::stats, :::tldr).
// Pure functions shared by the lesson parser (build-time validation) and the React renderers.

export type VisualKind = 'flow' | 'steps' | 'compare' | 'stats' | 'tldr';
export const VISUAL_KINDS: readonly VisualKind[] = ['flow', 'steps', 'compare', 'stats', 'tldr'];

/** Node roles a :::flow understands. Each gets its own glyph and colour in the renderer. */
export const FLOW_ROLES = ['user', 'client', 'cdn', 'lb', 'gateway', 'service', 'worker', 'cache', 'db', 'queue', 'storage', 'search', 'external'] as const;
export type FlowRole = (typeof FLOW_ROLES)[number];

export interface FlowNode { id: string; label: string; role: FlowRole; col: number; row: number }
export interface FlowStep { from: string; to: string; label: string }
export interface Flow { nodes: FlowNode[]; steps: FlowStep[] }

/**
 * :::flow body
 *   id | Label | role          (one node per line)
 *   ---
 *   from -> to | what happens  (one step per line, played in order)
 * Nodes are laid out left to right by how many hops they are from the first node; nodes at the same
 * distance stack vertically. Lines starting with # are comments.
 */
export function parseFlow(body: string): { flow: Flow; errors: string[] } {
  const errors: string[] = [];
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const sep = lines.findIndex(l => /^-{3,}$/.test(l));
  if (sep < 0) errors.push('flow: separate nodes and steps with a line containing ---');
  const nodeLines = sep < 0 ? lines : lines.slice(0, sep);
  const stepLines = sep < 0 ? [] : lines.slice(sep + 1);

  const nodes: FlowNode[] = [];
  for (const l of nodeLines) {
    const [id, label, role] = l.split('|').map(s => s.trim());
    if (!id || !/^[A-Za-z][\w-]*$/.test(id)) { errors.push(`flow: bad node line "${l}" (expected "id | Label | role")`); continue; }
    const r = (role || 'service').toLowerCase() as FlowRole;
    if (!FLOW_ROLES.includes(r)) errors.push(`flow: node "${id}" has unknown role "${role}" (use ${FLOW_ROLES.join(', ')})`);
    if (nodes.some(n => n.id === id)) errors.push(`flow: duplicate node "${id}"`);
    nodes.push({ id, label: label || id, role: FLOW_ROLES.includes(r) ? r : 'service', col: 0, row: 0 });
  }

  const steps: FlowStep[] = [];
  for (const l of stepLines) {
    const m = l.match(/^([A-Za-z][\w-]*)\s*->\s*([A-Za-z][\w-]*)\s*(?:\|\s*(.*))?$/);
    if (!m) { errors.push(`flow: bad step line "${l}" (expected "from -> to | label")`); continue; }
    const [, from, to, label = ''] = m;
    for (const id of [from, to]) if (!nodes.some(n => n.id === id)) errors.push(`flow: step uses unknown node "${id}"`);
    steps.push({ from, to, label: label.trim() });
  }
  if (nodes.length < 2) errors.push('flow: needs at least 2 nodes');
  if (nodes.length > 10) errors.push('flow: at most 10 nodes, or it stops being readable');
  if (steps.length < 1) errors.push('flow: needs at least 1 step');
  if (steps.length > 14) errors.push('flow: at most 14 steps; split it into two flows');

  layoutFlow(nodes, steps);
  return { flow: { nodes, steps }, errors };
}

/** Column = hop distance from the first node (breadth-first over step edges, both directions); row = order within a column. */
function layoutFlow(nodes: FlowNode[], steps: FlowStep[]) {
  if (!nodes.length) return;
  const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const s of steps) { adj.get(s.from)?.push(s.to); adj.get(s.to)?.push(s.from); }
  const depth = new Map<string, number>([[nodes[0].id, 0]]);
  const queue = [nodes[0].id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const nb of adj.get(id) ?? []) if (!depth.has(nb)) { depth.set(nb, depth.get(id)! + 1); queue.push(nb); }
  }
  let maxDepth = Math.max(...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, ++maxDepth); // disconnected nodes go on the right
  const rows = new Map<number, number>();
  for (const n of nodes) {
    n.col = depth.get(n.id)!;
    n.row = rows.get(n.col) ?? 0;
    rows.set(n.col, n.row + 1);
  }
}

/** "::name Title" subsections, ignoring lines inside code fences. */
export function namedParts(body: string): { name: string; title: string; text: string }[] {
  const out: { name: string; title: string; text: string }[] = [];
  let cur: { name: string; title: string; lines: string[] } | null = null;
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) fence = fence ? (line.trim().startsWith(fence) ? null : fence) : f[1];
    const m = !fence && !f ? line.match(/^::([a-z][\w-]*)\s*(.*)$/i) : null;
    if (m) {
      if (cur) out.push({ name: cur.name, title: cur.title, text: cur.lines.join('\n').trim() });
      cur = { name: m[1].toLowerCase(), title: m[2].trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  if (cur) out.push({ name: cur.name, title: cur.title, text: cur.lines.join('\n').trim() });
  return out;
}

export interface StepItem { title: string; text: string }
export function parseSteps(body: string): { steps: StepItem[]; errors: string[] } {
  const parts = namedParts(body);
  const errors: string[] = [];
  const steps = parts.filter(p => p.name === 'step').map(p => ({ title: p.title, text: p.text }));
  if (steps.length < 2) errors.push('steps: needs at least 2 "::step Title" parts');
  if (parts.some(p => p.name !== 'step')) errors.push('steps: only "::step Title" parts are allowed');
  steps.forEach((s, i) => { if (!s.title) errors.push(`steps: step ${i + 1} needs a title`); });
  return { steps, errors };
}

export type CompareTone = 'bad' | 'good' | 'neutral';
export interface CompareSide { tone: CompareTone; title: string; text: string }
export function parseCompare(body: string): { sides: CompareSide[]; errors: string[] } {
  const errors: string[] = [];
  const toneOf: Record<string, CompareTone> = { bad: 'bad', good: 'good', left: 'neutral', right: 'neutral', option: 'neutral' };
  const sides = namedParts(body).map(p => {
    if (!(p.name in toneOf)) errors.push(`compare: unknown part "::${p.name}" (use ::bad, ::good, ::left, ::right or ::option)`);
    return { tone: toneOf[p.name] ?? 'neutral', title: p.title, text: p.text };
  });
  if (sides.length < 2 || sides.length > 3) errors.push('compare: needs 2 or 3 parts');
  return { sides, errors };
}

export interface Stat { label: string; value: string; note: string }
/** :::stats body: "Label | Value | optional note" per line. */
export function parseStats(body: string): { stats: Stat[]; errors: string[] } {
  const errors: string[] = [];
  const stats = body.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [label = '', value = '', note = ''] = l.split('|').map(s => s.trim());
    if (!label || !value) errors.push(`stats: bad line "${l}" (expected "Label | Value | note")`);
    return { label, value, note };
  });
  if (stats.length < 2 || stats.length > 6) errors.push('stats: use 2–6 lines');
  return { stats, errors };
}

/** Splits "≈ 1,250 req/s" into prefix "≈ ", number 1250 (with its formatting) and suffix " req/s" for count-up animation. */
export function splitNumber(value: string): { prefix: string; num: number | null; decimals: number; grouped: boolean; suffix: string } {
  const m = value.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return { prefix: value, num: null, decimals: 0, grouped: false, suffix: '' };
  const raw = m[2];
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { prefix: m[1], num: Number(raw.replace(/,/g, '')), decimals, grouped: raw.includes(','), suffix: m[3] };
}

/** Validation entry point used by the lesson parser. */
export function validateVisual(kind: VisualKind, body: string): string[] {
  switch (kind) {
    case 'flow': return parseFlow(body).errors;
    case 'steps': return parseSteps(body).errors;
    case 'compare': return parseCompare(body).errors;
    case 'stats': return parseStats(body).errors;
    case 'tldr': return body.trim() ? [] : ['tldr: is empty'];
  }
}
