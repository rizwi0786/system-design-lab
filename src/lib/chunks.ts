// Splits a lesson section into bite-sized "concept" chunks at its ### headings, for Study mode.
// Headings inside fenced code blocks are ignored. Non-Markdown blocks (exercises, quizzes, playgrounds…)
// stay in the chunk they appear in.
import type { Block } from './lessonParser';

export interface Chunk { title: string | null; blocks: Block[] }

const FENCE = /^\s*(```|~~~)/;
const H3 = /^###\s+(.+?)\s*#*\s*$/;

const clean = (t: string) => t.replace(/[*_`]/g, '').trim();
const isBlank = (b: Block) => b.type === 'markdown' && !b.text.trim();

export function chunkSection(blocks: Block[]): Chunk[] {
  const chunks: Chunk[] = [{ title: null, blocks: [] }];
  const cur = () => chunks[chunks.length - 1];
  for (const b of blocks) {
    if (b.type !== 'markdown') { cur().blocks.push(b); continue; }
    let buf: string[] = [];
    let fence: string | null = null;
    const flush = () => { if (buf.join('').trim()) cur().blocks.push({ type: 'markdown', text: buf.join('\n') }); buf = []; };
    for (const line of b.text.split('\n')) {
      const f = FENCE.exec(line)?.[1];
      if (f) fence = fence === null ? f : fence === f ? null : fence;
      const h = fence === null ? H3.exec(line) : null;
      if (h) { flush(); chunks.push({ title: clean(h[1]), blocks: [] }); continue; }
      buf.push(line);
    }
    flush();
  }
  return chunks.filter(c => c.title !== null || c.blocks.some(b => !isBlank(b)));
}

/** Index of the chunk that contains an exercise with this id, or -1. */
export function chunkWithExercise(chunks: Chunk[], exerciseId: string): number {
  return chunks.findIndex(c => c.blocks.some(b => b.type === 'exercise' && b.exercise.id === exerciseId));
}
