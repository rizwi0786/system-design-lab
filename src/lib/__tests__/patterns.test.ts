import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERNS, CATEGORY_ORDER } from '../patterns';

describe('pattern atlas', () => {
  const ids = new Set(readFileSync(join(process.cwd(), 'content/curriculum.txt'), 'utf8').split('\n').filter(l => /^m\d\d-/.test(l)).map(l => l.split('|')[0].trim()));
  it('every pattern points at a lesson in the curriculum', () => {
    for (const p of PATTERNS) expect(ids.has(p.lessonId), `${p.name} → ${p.lessonId}`).toBe(true);
  });
  it('covers all 23 GoF patterns and every category', () => {
    expect(PATTERNS.filter(p => p.gof)).toHaveLength(23);
    for (const c of CATEGORY_ORDER) expect(PATTERNS.some(p => p.category === c)).toBe(true);
  });
});
