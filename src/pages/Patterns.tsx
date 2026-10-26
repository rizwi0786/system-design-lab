import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allLessons, lessonById } from '../lib/content';
import { CATEGORY_BLURB, CATEGORY_ORDER, mergeFrontmatterPatterns } from '../lib/patterns';
import { useProgress } from '../lib/progress';
import { Badge, PageHeader, StatusBadge } from '../components/ui';

export default function Patterns() {
  const p = useProgress();
  const [q, setQ] = useState('');
  const [onlyWritten, setOnlyWritten] = useState(false);
  const all = useMemo(() => mergeFrontmatterPatterns(allLessons), []);
  const filtered = all.filter(x => (!q || `${x.name} ${x.intent}`.toLowerCase().includes(q.toLowerCase())) && (!onlyWritten || lessonById.get(x.lessonId)?.hasContent));
  const written = all.filter(x => lessonById.get(x.lessonId)?.hasContent).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="Pattern Atlas">
        {all.length} patterns and anti-patterns across object-oriented design, .NET, concurrency, resilience, messaging, data and cloud architecture. {written} link to a written lesson; the rest are marked Planned.
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a pattern" aria-label="Find a pattern" className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={onlyWritten} onChange={e => setOnlyWritten(e.target.checked)} className="accent-[var(--color-accent)]" />Only patterns with a written lesson</label>
      </div>
      <div className="space-y-8">
        {CATEGORY_ORDER.map(cat => {
          const items = filtered.filter(x => x.category === cat);
          if (!items.length) return null;
          return (
            <section key={cat}>
              <h2 className="text-lg font-semibold text-ink">{cat} <span className="text-sm font-normal text-ink-3">({items.length})</span></h2>
              <p className="mb-3 text-sm text-ink-2">{CATEGORY_BLURB[cat]}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(x => {
                  const l = lessonById.get(x.lessonId);
                  return (
                    <Link key={x.name} to={`/lesson/${x.lessonId}`} className="rounded-lg border border-line bg-surface p-3 hover:border-accent">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{x.name}</span>
                        <span className="flex gap-1">{x.gof && <Badge tone="accent">GoF</Badge>}{p.completed[x.lessonId] ? <Badge tone="ok">Done</Badge> : <StatusBadge status={l?.status ?? 'planned'} />}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink-2">{x.intent}</p>
                      <p className="mt-2 truncate text-xs text-ink-3">Lesson: {l?.title ?? x.lessonId}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
