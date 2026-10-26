import { describe, expect, it } from 'vitest';
import { arrangeModel, ROW_H } from './layout';
import { LLD_TEMPLATES } from './templates';
import type { ClassModel } from './model';

const cls = (id: string) => ({ id, name: id, kind: 'class' as const, fields: [], methods: [] });

describe('arrangeModel', () => {
  it('puts abstractions above implementations and owners above parts', () => {
    const m: ClassModel = {
      classes: [cls('Impl'), cls('IThing'), cls('Owner'), cls('Part')],
      relations: [
        { id: 'r1', from: 'Impl', to: 'IThing', kind: 'implements' },
        { id: 'r2', from: 'Owner', to: 'Part', kind: 'composition' },
      ],
    } as ClassModel;
    const y = new Map(arrangeModel(m).classes.map((c) => [c.id, c.y]));
    expect(y.get('IThing')).toBe(40);
    expect(y.get('Impl')).toBe(40 + ROW_H);
    expect(y.get('Owner')).toBe(40);
    expect(y.get('Part')).toBe(40 + ROW_H);
  });

  it('gives every class of every template a distinct position', () => {
    for (const t of LLD_TEMPLATES) {
      const pos = arrangeModel(t.model).classes.map((c) => `${c.x},${c.y}`);
      expect(new Set(pos).size, t.id).toBe(pos.length);
    }
  });
});
