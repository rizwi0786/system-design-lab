import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { modules, TRACK_COLOR, TRACK_LABEL, contentStats, type Track } from '../lib/content';
import { useProgress } from '../lib/progress';
import { Icon, LevelBadge, PageHeader, ProgressRing, Select, StatusBadge, StatusDot, cx } from '../components/ui';

type F<T> = T | 'all';
export default function Curriculum() {
  const p = useProgress();
  const [params] = useSearchParams();
  const focus = params.get('m');
  const [q, setQ] = useState('');
  const [track, setTrack] = useState<F<Track>>('all');
  const [level, setLevel] = useState<F<string>>('all');
  const [status, setStatus] = useState<F<string>>('all');
  const [done, setDone] = useState<F<'done' | 'todo'>>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const s = contentStats();
  const filtering = !!q || level !== 'all' || status !== 'all' || done !== 'all';

  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => document.getElementById(focus)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [focus]);

  const filtered = useMemo(() => modules
    .filter(m => track === 'all' || m.track === track)
    .map(m => ({
      ...m,
      lessons: m.lessons.filter(l =>
        (level === 'all' || l.level === level) &&
        (status === 'all' || (status === 'written' ? l.hasContent : l.status === status)) &&
        (done === 'all' || (done === 'done') === !!p.completed[l.id]) &&
        (!q || `${l.title} ${l.topics.join(' ')} ${l.summary}`.toLowerCase().includes(q.toLowerCase()))),
    }))
    .filter(m => m.lessons.length), [track, level, status, done, q, p.completed]);

  const allOpen = filtered.every(m => open[m.id] ?? focus === m.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Curriculum" icon="map" actions={<button onClick={() => setOpen(Object.fromEntries(filtered.map(m => [m.id, !allOpen])))} className="text-sm font-medium text-accent">{allOpen ? 'Collapse all' : 'Expand all'}</button>}>
        {s.modules} modules · {s.written} lessons · nothing is locked
      </PageHeader>

      <div className="mb-6 space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by title or topic" aria-label="Filter" className="w-full rounded-xl border border-line bg-surface-2 py-2 pl-9 pr-3 text-sm text-ink focus:border-accent/50 focus:bg-surface" />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Track">
            {(['all', ...Object.keys(TRACK_LABEL)] as F<Track>[]).map(t => (
              <button key={t} onClick={() => setTrack(t)} aria-pressed={track === t}
                className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all', track === t ? 'border-transparent bg-ink text-bg' : 'border-line text-ink-2 hover:border-accent/40')}>
                {t !== 'all' && <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLOR[t] }} />}{t === 'all' ? 'All tracks' : TRACK_LABEL[t]}
              </button>
            ))}
          </div>
          <Select label="Level" value={level} onChange={setLevel} options={[{ value: 'all', label: 'All levels' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
          <Select label="Content" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'written', label: 'Written (any)' }, { value: 'reviewed', label: 'Reviewed' }, { value: 'draft', label: 'Draft' }, { value: 'planned', label: 'Planned' }]} />
          <Select label="My progress" value={done} onChange={setDone} options={[{ value: 'all', label: 'All' }, { value: 'done', label: 'Completed' }, { value: 'todo', label: 'Not completed' }]} />
        </div>
      </div>

      {!filtered.length && <p className="text-sm text-ink-3">No lessons match these filters.</p>}
      <div className="space-y-3">
        {filtered.map(m => {
          const written = m.lessons.filter(l => l.hasContent).length;
          const completedHere = m.lessons.filter(l => p.completed[l.id]).length;
          const isOpen = filtering || (open[m.id] ?? focus === m.id);
          const color = TRACK_COLOR[m.track];
          return (
            <section key={m.id} id={m.id} className={cx('scroll-mt-20 overflow-hidden rounded-2xl border bg-surface shadow-[var(--shadow-card)] transition-colors', focus === m.id ? 'border-accent/60' : 'border-line')}>
              <h2><button onClick={() => setOpen(o => ({ ...o, [m.id]: !isOpen }))} aria-expanded={isOpen} className="flex w-full items-center gap-4 p-4 text-left hover:bg-surface-2/50">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{m.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{TRACK_LABEL[m.track]}</span>
                  <span className="block text-lg font-bold leading-tight text-ink">{m.title}</span>
                  <span className="mt-0.5 line-clamp-1 text-sm font-normal text-ink-2">{m.description}</span>
                </span>
                <span className="hidden text-right text-xs text-ink-3 sm:block">{m.lessons.length} lessons</span>
                <ProgressRing value={(completedHere / Math.max(1, written)) * 100} size={44} stroke={5} color={color} label={`${completedHere} of ${written} completed`}>
                  <span className="text-[10px] font-semibold tabular-nums text-ink-2">{completedHere}/{written}</span>
                </ProgressRing>
                <Icon name="chevron" className={cx('h-5 w-5 shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-90')} />
              </button></h2>
              {isOpen && (
                <ul className="divide-y divide-line border-t border-line animate-fade-up">
                  {m.lessons.map((l, i) => (
                    <li key={l.id}>
                      <Link to={`/lesson/${l.id}`} className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-2">
                        <span className="w-5 text-right text-xs tabular-nums text-ink-3">{i + 1}</span>
                        <StatusDot status={l.status} complete={!!p.completed[l.id]} />
                        <span className={cx('min-w-0 flex-1 text-sm', l.hasContent ? 'font-medium text-ink group-hover:text-accent' : 'text-ink-3')}>{l.title}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <LevelBadge level={l.level} />
                          {l.status !== 'reviewed' && <StatusBadge status={l.status} />}
                          {l.hasContent && <span className="flex items-center gap-1 text-xs text-ink-3"><Icon name="clock" className="h-3 w-3" />{l.minutes}m</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
