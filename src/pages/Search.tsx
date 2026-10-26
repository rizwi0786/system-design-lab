import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { allLessons, lessonById } from '../lib/content';
import { createIndex, docsForLesson, excerpt, type SearchDoc } from '../lib/search';
import { mergeFrontmatterPatterns } from '../lib/patterns';
import { useAllLessons } from '../lib/useLessons';
import { Badge, PageHeader, StatusBadge } from '../components/ui';

const KIND_LABEL: Record<SearchDoc['kind'], string> = { lesson: 'Lesson', section: 'Section', exercise: 'Exercise', pattern: 'Pattern' };

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  useEffect(() => setInput(q), [q]);
  const lessons = useAllLessons();

  const index = useMemo(() => {
    const idx = createIndex();
    const docs: SearchDoc[] = allLessons.map(l => ({ id: `L:${l.id}`, kind: 'lesson', title: l.title, text: `${l.summary} ${l.topics.join(' ')} ${l.tags.join(' ')}`, lessonId: l.id, module: l.module }));
    for (const pt of mergeFrontmatterPatterns(allLessons)) docs.push({ id: `P:${pt.name}`, kind: 'pattern', title: pt.name, text: `${pt.category} ${pt.intent}`, lessonId: pt.lessonId, module: '' });
    for (const l of lessons ?? []) docs.push(...docsForLesson(l));
    idx.addAll(docs);
    return idx;
  }, [lessons]);

  const results = q ? index.search(q) : [];
  const terms = q.split(/\s+/).filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Search">Searches lesson titles, topics, every section of written lessons, exercises and the Pattern Atlas.</PageHeader>
      <form onSubmit={e => { e.preventDefault(); setParams(input ? { q: input } : {}); }} role="search" className="mb-6 flex gap-2">
        <input autoFocus value={input} onChange={e => setInput(e.target.value)} type="search" aria-label="Search query" placeholder="e.g. cache stampede, idempotency, decorator" className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        <button className="rounded-md bg-accent px-4 text-sm font-medium text-white dark:text-bg">Search</button>
      </form>
      {!lessons && <p className="mb-3 text-xs text-ink-3">Indexing lesson content…</p>}
      {q && <p className="mb-3 text-xs text-ink-3">{results.length} result{results.length === 1 ? '' : 's'} for “{q}”</p>}
      <ul className="space-y-2">
        {results.slice(0, 60).map(r => {
          const l = lessonById.get(r.lessonId as string);
          const to = r.anchor ? `/lesson/${r.lessonId}?at=${r.anchor}` : `/lesson/${r.lessonId}`;
          return (
            <li key={r.id}>
              <Link to={to} className="block rounded-lg border border-line bg-surface p-3 hover:border-accent">
                <div className="flex flex-wrap items-center gap-2"><Badge>{KIND_LABEL[r.kind as SearchDoc['kind']]}</Badge><span className="font-medium text-ink">{r.title}</span>{l && r.kind === 'lesson' && <StatusBadge status={l.status} />}</div>
                <p className="mt-1 text-sm text-ink-2">{excerpt(String(r.text ?? ''), terms)}</p>
                {r.kind !== 'lesson' && l && <p className="mt-1 text-xs text-ink-3">{l.title}</p>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
