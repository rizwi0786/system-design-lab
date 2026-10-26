import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIndex, docsForLesson, excerpt } from '../search';
import { parseLesson } from '../lessonParser';

describe('search', () => {
  it('indexes sections and exercises of a lesson', () => {
    const p = parseLesson(readFileSync(join(process.cwd(), 'content/lessons/m06/m06-strategy.md'), 'utf8'));
    const docs = docsForLesson(p);
    expect(docs.some(d => d.kind === 'exercise')).toBe(true);
    const idx = createIndex();
    idx.addAll(docs);
    const r = idx.search('keyed services');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].lessonId).toBe('m06-strategy');
    expect(idx.search('festival discount').some(x => x.kind === 'exercise')).toBe(true);
  });
  it('makes excerpts around the match', () => {
    expect(excerpt('a'.repeat(100) + ' cache stampede ' + 'b'.repeat(300), ['stampede'])).toContain('stampede');
  });
});
