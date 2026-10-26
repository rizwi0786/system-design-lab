// LLD class model types and helpers (format: docs/CONTENT_MODEL.md §6 "LLD class model").
// Optional extras the playground adds on top of the content format: positions (x, y), generics,
// a per-class state machine, and free-text design notes on the model.

export type ClassKind = 'class' | 'abstract' | 'interface' | 'record' | 'enum';
export type RelationKind = 'inherits' | 'implements' | 'composition' | 'aggregation' | 'association' | 'dependency';

export const CLASS_KINDS: ClassKind[] = ['class', 'interface', 'abstract', 'record', 'enum'];
export const RELATION_KINDS: RelationKind[] = ['inherits', 'implements', 'composition', 'aggregation', 'association', 'dependency'];

export interface StateTransition { from: string; to: string; event?: string }

export interface ClassNode {
  id: string;
  name: string;
  kind: ClassKind;
  /** e.g. "-decimal _percent", "+string Name { get; set; }"; for enums: member names. */
  fields: string[];
  /** e.g. "+decimal Calculate(Order order)" */
  methods: string[];
  responsibility?: string;
  /** Type parameters, e.g. ["T"]. A name like "Repository<T>" is also understood. */
  generics?: string[];
  x?: number;
  y?: number;
  states?: string[];
  transitions?: StateTransition[];
}

export interface Relation {
  id?: string;
  from: string;
  to: string;
  kind: RelationKind;
  label?: string;
  /** Multiplicity at the `to` end, e.g. "1..*". */
  multiplicity?: string;
}

export interface ClassModel {
  classes: ClassNode[];
  relations: Relation[];
  notes?: string;
}

export const emptyModel = (): ClassModel => ({ classes: [], relations: [], notes: '' });

const isKind = (k: unknown): k is ClassKind => typeof k === 'string' && (CLASS_KINDS as string[]).includes(k);
const isRelKind = (k: unknown): k is RelationKind => typeof k === 'string' && (RELATION_KINDS as string[]).includes(k);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Validates unknown JSON into a ClassModel, filling defaults (ids, arrays, grid positions). Throws on bad shape. */
export function normalizeModel(input: unknown): ClassModel {
  if (!input || typeof input !== 'object') throw new Error('Model must be a JSON object');
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.classes)) throw new Error('Model needs a "classes" array');
  const seen = new Set<string>();
  const classes: ClassNode[] = raw.classes.map((c: unknown, i: number) => {
    if (!c || typeof c !== 'object') throw new Error(`classes[${i}] is not an object`);
    const o = c as Record<string, unknown>;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : `Class${i + 1}`;
    let id = typeof o.id === 'string' && o.id ? o.id : baseName(name);
    while (seen.has(id)) id += '_';
    seen.add(id);
    const node: ClassNode = {
      id, name, kind: isKind(o.kind) ? o.kind : 'class',
      fields: strArr(o.fields), methods: strArr(o.methods),
    };
    if (typeof o.responsibility === 'string') node.responsibility = o.responsibility;
    const g = strArr(o.generics);
    if (g.length) node.generics = g;
    node.x = typeof o.x === 'number' ? o.x : 40 + (i % 4) * 280;
    node.y = typeof o.y === 'number' ? o.y : 40 + Math.floor(i / 4) * 260;
    const states = strArr(o.states);
    if (states.length) node.states = states;
    if (Array.isArray(o.transitions)) {
      node.transitions = o.transitions
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .filter((t) => typeof t.from === 'string' && typeof t.to === 'string')
        .map((t) => ({ from: t.from as string, to: t.to as string, ...(typeof t.event === 'string' && t.event ? { event: t.event } : {}) }));
    }
    return node;
  });
  // Relations reference class ids; a class name is accepted too.
  const resolve = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string') return undefined;
    if (seen.has(ref)) return ref;
    const lower = ref.toLowerCase();
    return classes.find((c) => c.name.toLowerCase() === lower || baseName(c.name).toLowerCase() === lower)?.id;
  };
  const rels = Array.isArray(raw.relations) ? raw.relations : [];
  const relations: Relation[] = [];
  rels.forEach((r: unknown, i: number) => {
    if (!r || typeof r !== 'object') return;
    const o = r as Record<string, unknown>;
    const from = resolve(o.from);
    const to = resolve(o.to);
    if (!from || !to) return;
    const rel: Relation = { id: typeof o.id === 'string' && o.id ? o.id : `r${i + 1}`, from, to, kind: isRelKind(o.kind) ? o.kind : 'association' };
    if (typeof o.label === 'string' && o.label) rel.label = o.label;
    if (typeof o.multiplicity === 'string' && o.multiplicity) rel.multiplicity = o.multiplicity;
    relations.push(rel);
  });
  const ids = new Set<string>();
  for (const r of relations) { while (ids.has(r.id!)) r.id += '_'; ids.add(r.id!); }
  return { classes, relations, notes: typeof raw.notes === 'string' ? raw.notes : '' };
}

// ---------- member parsing ----------

export type Visibility = 'public' | 'private' | 'protected' | 'internal' | '';
const VIS: Record<string, Visibility> = { '+': 'public', '-': 'private', '#': 'protected', '~': 'internal' };

/** Class name without generic suffix: "Repository<T>" → "Repository". */
export function baseName(name: string): string {
  return name.replace(/<.*$/, '').replace(/~.*$/, '').trim().replace(/[^\w]/g, '_') || 'Unnamed';
}

/** Generic parameters from the `generics` array or a name like "Repo<T, K>". */
export function genericsOf(c: Pick<ClassNode, 'name' | 'generics'>): string[] {
  if (c.generics?.length) return c.generics;
  const m = /<(.+)>\s*$/.exec(c.name);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export interface ParsedMember {
  visibility: Visibility;
  /** Text after the visibility marker. */
  body: string;
  name: string;
  /** Type for fields, return type for methods ('' when not given). */
  type: string;
  params: string;
  isMethod: boolean;
  isProperty: boolean;
  modifiers: string[];
}

const MODIFIERS = ['static', 'abstract', 'virtual', 'override', 'readonly', 'const', 'async', 'sealed', 'required'];

export function parseMember(raw: string): ParsedMember {
  let s = raw.trim();
  let visibility: Visibility = '';
  if (s && VIS[s[0]]) { visibility = VIS[s[0]]; s = s.slice(1).trim(); }
  let body = s;
  // A trailing mermaid-style "$" (static) or "*" (abstract) marker.
  const modifiers: string[] = [];
  if (/[*$]$/.test(body) && !body.endsWith('{ get; set; }')) {
    modifiers.push(body.endsWith('*') ? 'abstract' : 'static');
    body = body.slice(0, -1).trim();
  }
  let words = body;
  for (;;) {
    const m = /^(\w+)\s+/.exec(words);
    if (m && MODIFIERS.includes(m[1])) { modifiers.push(m[1]); words = words.slice(m[0].length); } else break;
  }
  const paren = words.indexOf('(');
  if (paren >= 0) {
    const before = words.slice(0, paren).trim();
    const close = words.lastIndexOf(')');
    const params = words.slice(paren + 1, close > paren ? close : undefined).trim();
    const after = close > paren ? words.slice(close + 1).trim().replace(/^:\s*/, '') : '';
    const nameMatch = /(\w+)\s*(<[^<>]*>)?$/.exec(before);
    const name = nameMatch ? nameMatch[1] : before;
    let type = nameMatch ? before.slice(0, nameMatch.index).trim() : '';
    if (!type && after) type = after; // "Calculate(Order o) decimal" or ": decimal" style
    return { visibility, body, name, type, params, isMethod: true, isProperty: false, modifiers };
  }
  const isProperty = /\{[^}]*\}/.test(words);
  const decl = words.replace(/\{[^}]*\}.*$/, '').replace(/=.*$/, '').trim();
  // "Name: string" style
  const colon = /^(\w+)\s*:\s*(.+)$/.exec(decl);
  if (colon) return { visibility, body, name: colon[1], type: colon[2].trim(), params: '', isMethod: false, isProperty, modifiers };
  const m = /(\w+)\s*$/.exec(decl);
  const name = m ? m[1] : decl;
  const type = m ? decl.slice(0, m.index).trim() : '';
  return { visibility, body, name, type, params: '', isMethod: false, isProperty, modifiers };
}

export const methodNames = (c: ClassNode): string[] => c.methods.map((m) => parseMember(m).name).filter(Boolean);
