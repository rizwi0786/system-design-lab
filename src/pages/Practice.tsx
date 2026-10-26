import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { moduleById, modules } from '../lib/content';
import { useAllLessons } from '../lib/useLessons';
import { useProgress } from '../lib/progress';
import { Badge, LevelBadge, PageHeader, Select, Spinner, Empty } from '../components/ui';

const KIND: Record<string, string> = { code: 'C# code', design: 'LLD design', hld: 'HLD design', sql: 'SQL', written: 'Written' };

export default function Practice() {
  const lessons = useAllLessons();
  const p = useProgress();
  const [track, setTrack] = useState('all');
  const [mod, setMod] = useState('all');
  const [diff, setDiff] = useState('all');
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('all');
  const [interview, setInterview] = useState(false);

  const rows = useMemo(() => (lessons ?? []).flatMap(l => l.exercises.map(e => ({ e, l, m: moduleById.get(l.meta.module) }))), [lessons]);
  const filtered = rows.filter(({ e, l, m }) =>
    (track === 'all' || (track === 'lld' ? ['lld', 'foundations'].includes(m?.track ?? '') || e.kind === 'design' : track === 'hld' ? m?.track === 'hld' || e.kind === 'hld' : m?.track === track)) &&
    (mod === 'all' || l.meta.module === mod) && (diff === 'all' || e.difficulty === diff) && (kind === 'all' || e.kind === kind) &&
    (state === 'all' || (state === 'done') === !!p.exercises[e.id]?.done) &&
    (!interview || l.meta.module === 'm17' || l.meta.module === 'm18' || l.meta.module === 'm19' || l.meta.tags.includes('interview') || e.difficulty === 'advanced'));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Practice center">Every exercise from every written lesson. Filter, then jump straight to it in its lesson.</PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-6">
        <Select label="Track" value={track} onChange={setTrack} options={[{ value: 'all', label: 'LLD + HLD' }, { value: 'lld', label: 'LLD & foundations' }, { value: 'hld', label: 'HLD' }, { value: 'ops', label: 'Ops & security' }, { value: 'career', label: 'Interviews' }]} />
        <Select label="Module" value={mod} onChange={setMod} options={[{ value: 'all', label: 'All modules' }, ...modules.filter(m => m.lessons.some(l => l.hasContent)).map(m => ({ value: m.id, label: `${m.number}. ${m.title}` }))]} />
        <Select label="Difficulty" value={diff} onChange={setDiff} options={[{ value: 'all', label: 'Any' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
        <Select label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Any' }, ...Object.entries(KIND).map(([value, label]) => ({ value, label }))]} />
        <Select label="Status" value={state} onChange={setState} options={[{ value: 'all', label: 'Any' }, { value: 'todo', label: 'Not done' }, { value: 'done', label: 'Done' }]} />
        <label className="flex items-end gap-2 pb-2 text-sm text-ink-2"><input type="checkbox" checked={interview} onChange={e => setInterview(e.target.checked)} className="accent-[var(--color-accent)]" />Interview-relevant</label>
      </div>
      {!lessons ? <Spinner label="Loading exercises…" /> : !filtered.length ? <Empty title="No exercises match these filters" /> : (
        <>
          <p className="mb-2 text-xs text-ink-3">{filtered.length} of {rows.length} exercises</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {filtered.map(({ e, l }) => (
              <li key={e.id}>
                <Link to={`/lesson/${l.meta.id}?at=${e.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0 flex-1"><span className="block text-sm text-ink">{e.title}</span><span className="text-xs text-ink-3">{l.meta.title}</span></span>
                  <LevelBadge level={e.difficulty} />
                  <Badge>{KIND[e.kind] ?? e.kind}</Badge>
                  {p.exercises[e.id]?.done && <Badge tone="ok">Done</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
