// Deterministic design checks and model comparison. Pure functions — see analyze.test.ts.
import { baseName, methodNames, parseMember } from './model';
import type { ClassModel, ClassNode, Relation, RelationKind } from './model';

export type LldSeverity = 'error' | 'warning' | 'tradeoff' | 'info';

export interface LldFinding {
  id: string;
  severity: LldSeverity;
  title: string;
  detail: string;
  classIds: string[];
}

export const LIMITS = { maxDependencies: 7, maxMethods: 12, maxFields: 10, maxInterfaceMethods: 6, maxInheritanceDepth: 3 } as const;

const SEVERITY_ORDER: Record<LldSeverity, number> = { error: 0, warning: 1, tradeoff: 2, info: 3 };

/** Strongly connected components with more than one node (or a self-loop), via Tarjan. Sorted for determinism. */
export function findCycles(ids: string[], edges: [string, string][]): string[][] {
  const adj = new Map<string, string[]>(ids.map((i) => [i, []]));
  const selfLoops = new Set<string>();
  for (const [a, b] of edges) {
    if (!adj.has(a) || !adj.has(b)) continue;
    if (a === b) selfLoops.add(a);
    if (!adj.get(a)!.includes(b)) adj.get(a)!.push(b);
  }
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index); low.set(v, index); index++;
    stack.push(v); onStack.add(v);
    for (const w of adj.get(v)!) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1 || selfLoops.has(v)) out.push(comp.sort());
    }
  };
  for (const v of [...ids].sort()) if (!idx.has(v)) visit(v);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

const USES: RelationKind[] = ['composition', 'aggregation', 'association', 'dependency'];
const isConcrete = (c: ClassNode) => c.kind === 'class' || c.kind === 'record';

export function analyzeModel(model: ClassModel): LldFinding[] {
  const findings: LldFinding[] = [];
  const byId = new Map(model.classes.map((c) => [c.id, c] as const));
  const nm = (id: string) => byId.get(id)?.name ?? id;
  const rels = model.relations.filter((r) => byId.has(r.from) && byId.has(r.to));
  const ids = model.classes.map((c) => c.id);
  const add = (f: LldFinding) => findings.push(f);

  // 1. Composition cycle → error (a part cannot own its owner).
  const compCycles = findCycles(ids, rels.filter((r) => r.kind === 'composition').map((r) => [r.from, r.to]));
  const compKeys = new Set(compCycles.map((c) => c.join('|')));
  for (const cyc of compCycles) {
    add({
      id: `composition-cycle:${cyc.join(',')}`, severity: 'error', title: 'Composition cycle',
      detail: `${cyc.map(nm).join(' → ')} own each other through composition. Composition means the whole controls the part's lifetime, so a cycle would mean an object owns itself — it can never be created or destroyed cleanly. Make one side an association or aggregation.`,
      classIds: cyc,
    });
  }

  // 2. Circular dependency (any relation kind) → warning.
  for (const cyc of findCycles(ids, rels.map((r) => [r.from, r.to]))) {
    if (compKeys.has(cyc.join('|'))) continue;
    add({
      id: `cycle:${cyc.join(',')}`, severity: 'warning', title: 'Circular dependency',
      detail: `${cyc.map(nm).join(', ')} depend on each other in a loop. A change in any of them can ripple to all the others, they cannot be compiled, tested or reused separately, and construction order becomes tricky. Break the loop with an interface, an event/callback, or by moving the shared part into a new class.`,
      classIds: cyc,
    });
  }

  for (const c of model.classes) {
    const out = rels.filter((r) => r.from === c.id && r.to !== c.id);
    const deps = [...new Set(out.map((r) => r.to))];

    // 3. Efferent coupling.
    if (deps.length > LIMITS.maxDependencies) {
      add({
        id: `coupling:${c.id}`, severity: 'warning', title: `High coupling (${deps.length} dependencies)`,
        detail: `${c.name} depends on ${deps.length} other types (more than ${LIMITS.maxDependencies}). Every dependency is a reason for this class to change and something to set up in each test. Consider grouping collaborators behind a facade or splitting the class by responsibility.`,
        classIds: [c.id],
      });
    }

    // 4. God class.
    if (c.methods.length > LIMITS.maxMethods || c.fields.length > LIMITS.maxFields) {
      add({
        id: `god-class:${c.id}`, severity: 'warning', title: 'Possible god class',
        detail: `${c.name} has ${c.methods.length} methods and ${c.fields.length} fields (limits used here: ${LIMITS.maxMethods} methods, ${LIMITS.maxFields} fields). A class that knows and does this much usually has several responsibilities, so unrelated changes collide in one file. Look for groups of fields used by only some methods — each group is a candidate class.`,
        classIds: [c.id],
      });
    }

    // 5. Fat interface (ISP).
    if (c.kind === 'interface' && c.methods.length > LIMITS.maxInterfaceMethods) {
      add({
        id: `isp:${c.id}`, severity: 'tradeoff', title: 'Large interface (Interface Segregation)',
        detail: `${c.name} declares ${c.methods.length} methods. Implementers must provide all of them, even ones a caller never uses, and every change touches every implementer. Splitting it into smaller role interfaces keeps clients lean — but too many tiny interfaces also cost readability, so split along real client needs.`,
        classIds: [c.id],
      });
    }

    // 6. DIP: concrete → concrete while an interface for the target exists.
    if (isConcrete(c)) {
      for (const r of out) {
        if (!USES.includes(r.kind)) continue;
        const target = byId.get(r.to)!;
        if (!isConcrete(target)) continue;
        const ifaces = rels.filter((x) => x.from === target.id && x.kind === 'implements').map((x) => byId.get(x.to)!).filter((t) => t.kind === 'interface');
        if (!ifaces.length) continue;
        add({
          id: `dip:${c.id}->${target.id}`, severity: 'tradeoff', title: 'Depends on a concrete class (Dependency Inversion)',
          detail: `${c.name} uses ${target.name} directly, although ${target.name} implements ${ifaces.map((i) => i.name).join(', ')}. Depending on the interface would let you swap or fake the implementation in tests without touching ${c.name}. Depending on the concrete class is fine when there will only ever be one implementation.`,
          classIds: [c.id, target.id],
        });
      }
    }

    // 7. Implements an interface without any of its method names.
    for (const r of out.filter((x) => x.kind === 'implements')) {
      const iface = byId.get(r.to)!;
      const wanted = methodNames(iface);
      if (!wanted.length) continue;
      const have = new Set(methodsWithAncestors(c.id, rels, byId));
      if (wanted.some((w) => have.has(w))) continue;
      add({
        id: `unimplemented:${c.id}->${iface.id}`, severity: 'error', title: 'Interface not implemented',
        detail: `${c.name} says it implements ${iface.name} but declares none of its methods (${wanted.join(', ')}). The compiler would reject this, and callers relying on the interface would have nothing to call. Add the methods or remove the relation.`,
        classIds: [c.id, iface.id],
      });
    }

    // 8. Inheritance depth.
    const depth = inheritanceDepth(c.id, rels);
    if (depth > LIMITS.maxInheritanceDepth) {
      add({
        id: `depth:${c.id}`, severity: 'tradeoff', title: `Deep inheritance (${depth} levels)`,
        detail: `${c.name} sits ${depth} levels below its top base class. To understand it you must read every ancestor, and a change high in the chain can break it silently (fragile base class). Composition — holding a collaborator instead of inheriting from it — is often easier to change.`,
        classIds: [c.id],
      });
    }

    // 9. No responsibility.
    if (!c.responsibility?.trim()) {
      add({
        id: `no-responsibility:${c.id}`, severity: 'info', title: 'No responsibility written',
        detail: `${c.name} has no responsibility text. Writing one sentence ("Calculates the fare for a parking ticket") is a quick test of cohesion: if you need "and" twice, the class probably does too much.`,
        classIds: [c.id],
      });
    }

    // 10. Isolated class.
    if (model.classes.length > 1 && !rels.some((r) => r.from === c.id || r.to === c.id)) {
      add({
        id: `isolated:${c.id}`, severity: 'info', title: 'Class has no relations',
        detail: `${c.name} is not connected to anything. Either a relation is missing from the diagram, or the class is not needed for this design.`,
        classIds: [c.id],
      });
    }

    // 11. Public fields.
    if (c.kind === 'class' || c.kind === 'abstract') {
      const pub = c.fields.map(parseMember).filter((m) => m.visibility === 'public' && !m.isProperty && !m.modifiers.includes('const'));
      if (pub.length) {
        add({
          id: `public-fields:${c.id}`, severity: 'info', title: 'Public fields (encapsulation)',
          detail: `${c.name} exposes ${pub.map((p) => p.name).join(', ')} as public fields. Any code can change them without the class knowing, so rules like "balance never goes negative" cannot be enforced. Prefer a property ({ get; private set; }) or a method that validates the change.`,
          classIds: [c.id],
        });
      }
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
}

function methodsWithAncestors(id: string, rels: Relation[], byId: Map<string, ClassNode>, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const c = byId.get(id);
  if (!c) return [];
  const parents = rels.filter((r) => r.from === id && r.kind === 'inherits').map((r) => r.to);
  return [...methodNames(c), ...parents.flatMap((p) => methodsWithAncestors(p, rels, byId, seen))];
}

/** Number of `inherits` edges on the longest chain upwards from `id` (cycle-safe). */
export function inheritanceDepth(id: string, rels: Relation[], seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  const next = new Set(seen).add(id);
  const parents = rels.filter((r) => r.from === id && r.kind === 'inherits').map((r) => r.to);
  return parents.length ? 1 + Math.max(...parents.map((p) => inheritanceDepth(p, rels, next))) : 0;
}

// ---------- comparison ----------

export interface RelationRef { from: string; to: string; kind: RelationKind }

export interface ModelComparison {
  /** Class names present in both (reference spelling). */
  matchedClasses: string[];
  /** In the reference design but not in yours. */
  missingClasses: string[];
  /** In your design but not in the reference. */
  extraClasses: string[];
  kindDifferences: { name: string; mine: string; reference: string }[];
  methodDifferences: { name: string; onlyInReference: string[]; onlyInMine: string[] }[];
  missingRelations: RelationRef[];
  extraRelations: RelationRef[];
  relationKindDifferences: { from: string; to: string; mine: RelationKind; reference: RelationKind }[];
}

const key = (s: string) => baseName(s).toLowerCase();

/** Differences between two designs. Classes match case-insensitively by name. Not a grade: many designs are valid. */
export function compareModels(mine: ClassModel, reference: ClassModel): ModelComparison {
  const mineBy = new Map(mine.classes.map((c) => [key(c.name), c] as const));
  const refBy = new Map(reference.classes.map((c) => [key(c.name), c] as const));
  const result: ModelComparison = { matchedClasses: [], missingClasses: [], extraClasses: [], kindDifferences: [], methodDifferences: [], missingRelations: [], extraRelations: [], relationKindDifferences: [] };

  for (const [k, rc] of refBy) {
    const mc = mineBy.get(k);
    if (!mc) { result.missingClasses.push(rc.name); continue; }
    result.matchedClasses.push(rc.name);
    if (mc.kind !== rc.kind) result.kindDifferences.push({ name: rc.name, mine: mc.kind, reference: rc.kind });
    const rm = new Set(methodNames(rc).map((m) => m.toLowerCase()));
    const mm = new Set(methodNames(mc).map((m) => m.toLowerCase()));
    const onlyInReference = methodNames(rc).filter((m) => !mm.has(m.toLowerCase()));
    const onlyInMine = methodNames(mc).filter((m) => !rm.has(m.toLowerCase()));
    if (onlyInReference.length || onlyInMine.length) result.methodDifferences.push({ name: rc.name, onlyInReference, onlyInMine });
  }
  for (const [k, mc] of mineBy) if (!refBy.has(k)) result.extraClasses.push(mc.name);

  const named = (m: ClassModel) => {
    const by = new Map(m.classes.map((c) => [c.id, c.name] as const));
    return m.relations.filter((r) => by.has(r.from) && by.has(r.to)).map((r) => ({ from: by.get(r.from)!, to: by.get(r.to)!, kind: r.kind }));
  };
  const mineRels = named(mine);
  const refRels = named(reference);
  const pair = (r: RelationRef) => `${key(r.from)}→${key(r.to)}`;
  const minePairs = new Map<string, RelationRef[]>();
  for (const r of mineRels) minePairs.set(pair(r), [...(minePairs.get(pair(r)) ?? []), r]);
  const usedMine = new Set<RelationRef>();

  for (const r of refRels) {
    const candidates = minePairs.get(pair(r)) ?? [];
    const exact = candidates.find((m) => m.kind === r.kind && !usedMine.has(m));
    if (exact) { usedMine.add(exact); continue; }
    const other = candidates.find((m) => !usedMine.has(m));
    if (other) { usedMine.add(other); result.relationKindDifferences.push({ from: r.from, to: r.to, mine: other.kind, reference: r.kind }); continue; }
    result.missingRelations.push(r);
  }
  for (const r of mineRels) if (!usedMine.has(r)) result.extraRelations.push(r);
  return result;
}
