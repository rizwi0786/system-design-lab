// Layered auto-arrange for class diagrams: abstractions above the classes that use or extend them,
// owners above their parts. Each layer is centred under the widest one.
import type { ClassModel, RelationKind } from './model';

const OWNER_ON_TOP: RelationKind[] = ['composition', 'aggregation'];
export const CARD_W = 280;
export const ROW_H = 220;

export function arrangeModel(m: ClassModel): ClassModel {
  const rank = new Map(m.classes.map((c) => [c.id, 0]));
  const pairs = m.relations
    .filter((r) => r.from !== r.to && rank.has(r.from) && rank.has(r.to))
    .map((r) => (OWNER_ON_TOP.includes(r.kind) ? { upper: r.from, lower: r.to } : { upper: r.to, lower: r.from }));
  // Longest-path layering, capped at the class count so cycles just stop growing.
  for (let i = 0; i < m.classes.length; i++) {
    let changed = false;
    for (const { upper, lower } of pairs) {
      const want = rank.get(upper)! + 1;
      if (want > rank.get(lower)! && want < m.classes.length) { rank.set(lower, want); changed = true; }
    }
    if (!changed) break;
  }
  const perRow = new Map<number, number>();
  for (const r of rank.values()) perRow.set(r, (perRow.get(r) ?? 0) + 1);
  const widest = Math.max(1, ...perRow.values());
  const seen = new Map<number, number>();
  return {
    ...m,
    classes: m.classes.map((c) => {
      const r = rank.get(c.id)!;
      const i = seen.get(r) ?? 0;
      seen.set(r, i + 1);
      return { ...c, x: Math.round(40 + (i + (widest - perRow.get(r)!) / 2) * CARD_W), y: 40 + r * ROW_H };
    }),
  };
}
