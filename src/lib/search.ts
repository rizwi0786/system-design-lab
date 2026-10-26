// Full-text search over lessons (title, summary, topics, section text), exercises and patterns.
// The manifest part is indexed immediately; written lesson bodies are loaded and indexed lazily.
import MiniSearch from 'minisearch';
import type { ParsedLesson, Block } from './lessonParser';

export interface SearchDoc { id: string; kind: 'lesson' | 'section' | 'exercise' | 'pattern'; title: string; text: string; lessonId: string; anchor?: string; module: string }

export function createIndex() {
  return new MiniSearch<SearchDoc>({
    fields: ['title', 'text'],
    storeFields: ['kind', 'title', 'lessonId', 'anchor', 'module', 'text'],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
}

const stripMd = (s: string) => s.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()|-]/g, ' ').replace(/\s+/g, ' ').trim();

function blockText(b: Block): string {
  switch (b.type) {
    case 'markdown': return b.text;
    case 'callout': return b.title + ' ' + b.text;
    case 'interview': return b.questions.map(q => q.question + ' ' + q.answer).join(' ');
    case 'flashcards': return b.cards.map(c => c.front + ' ' + c.back).join(' ');
    case 'quiz': return b.quiz.questions.map(q => q.prompt).join(' ');
    default: return '';
  }
}

export function docsForLesson(p: ParsedLesson): SearchDoc[] {
  const docs: SearchDoc[] = [];
  const base = { lessonId: p.meta.id, module: p.meta.module };
  for (const s of p.sections) {
    const text = stripMd(s.blocks.map(blockText).join(' '));
    if (text) docs.push({ ...base, id: `${p.meta.id}#${s.id}`, kind: 'section', title: `${p.meta.title} — ${s.title}`, text, anchor: s.id });
  }
  for (const e of p.exercises) docs.push({ ...base, id: `${p.meta.id}!${e.id}`, kind: 'exercise', title: e.title, text: stripMd(`${e.description} ${e.requirements} ${e.acceptance.join(' ')}`), anchor: e.id });
  return docs;
}

export function excerpt(text: string, terms: string[], len = 160): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = lower.indexOf(t.toLowerCase()); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 50);
  return (start > 0 ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '');
}
