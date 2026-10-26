import { chunkSection, chunkWithExercise } from '../chunks';
import type { Block, Exercise } from '../lessonParser';

const md = (text: string): Block => ({ type: 'markdown', text });

describe('chunkSection', () => {
  it('splits at ### headings and keeps a lead chunk', () => {
    const c = chunkSection([md('Intro text.\n\n### What it is\nA.\n\n### Why **it** exists\nB.')]);
    expect(c.map(x => x.title)).toEqual([null, 'What it is', 'Why it exists']);
    expect(c[1].blocks).toEqual([md('A.\n')]);
  });

  it('ignores headings inside code fences and drops an empty lead', () => {
    const c = chunkSection([md('### Step 1\n```md\n### not a heading\n```\n### Step 2\nx')]);
    expect(c.map(x => x.title)).toEqual(['Step 1', 'Step 2']);
    expect((c[0].blocks[0] as { text: string }).text).toContain('### not a heading');
  });

  it('keeps non-markdown blocks in the current chunk', () => {
    const ex = { id: 'ex1' } as Exercise;
    const c = chunkSection([md('### A\ntext'), { type: 'exercise', exercise: ex }, md('### B\nmore')]);
    expect(c[0].blocks).toHaveLength(2);
    expect(chunkWithExercise(c, 'ex1')).toBe(0);
    expect(chunkWithExercise(c, 'nope')).toBe(-1);
  });

  it('returns a single untitled chunk when there are no subheadings', () => {
    expect(chunkSection([md('Just text.')])).toEqual([{ title: null, blocks: [md('Just text.')] }]);
  });
});
