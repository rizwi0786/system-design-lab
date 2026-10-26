import { Link } from 'react-router-dom';
import { allLessons, lessonById, moduleById, modules, TRACK_COLOR, writtenLessons } from '../lib/content';
import { useProgress, recommendations, weakTopics, dueCards, pendingExercises, bestQuiz, type LessonInfo } from '../lib/progress';
import { DAILY_GOAL_XP, levelFor, levelTitle, recentDays, streak, todayXp, totalXp } from '../lib/gamify';
import { readJson } from '../lib/storage';
import { ButtonLink, Card, Empty, Icon, ProgressRing, StatTile, Badge, cx, type IconName } from '../components/ui';
import { daysSinceExport } from '../lib/backup';

const lessonInfos: LessonInfo[] = allLessons.map(l => ({ id: l.id, exercises: l.exercises, prerequisites: l.prerequisites, hasContent: l.hasContent, module: l.module, title: l.title }));
const title = (id: string) => lessonById.get(id)?.title ?? id;
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

const ACTIVITY_ICON: Record<string, IconName> = { visit: 'book', quiz: 'exam', exercise: 'pen', complete: 'trophy', flashcard: 'cards', note: 'note', bookmark: 'star', exam: 'exam', interview: 'chat', hint: 'bulb', solution: 'eye' };

export default function Dashboard() {
  const p = useProgress();
  const completed = Object.keys(p.completed);
  const visited = Object.entries(p.visits).sort((a, b) => b[1].last.localeCompare(a[1].last));
  const last = visited.find(([id]) => lessonById.get(id)?.hasContent)?.[0];
  const lastMeta = last ? lessonById.get(last) : undefined;
  const currentModule = lastMeta ? moduleById.get(lastMeta.module) : undefined;
  const recs = recommendations(p, lessonInfos);
  const weak = weakTopics(p);
  const due = dueCards(p);
  const pending = pendingExercises(p);
  const quizLessons = Object.keys(p.quiz).filter(k => p.quiz[k].length);
  const avgBest = quizLessons.length ? Math.round(quizLessons.reduce((n, id) => n + (bestQuiz(p, id)?.score ?? 0), 0) / quizLessons.length) : null;
  const totalSeconds = Object.values(p.visits).reduce((n, v) => n + v.seconds, 0);
  const exercisesDone = Object.values(p.exercises).filter(e => e.done).length;

  const xp = totalXp(p);
  const lv = levelFor(xp);
  const st = streak(p);
  const today = todayXp(p);
  const week = recentDays(p, 7);
  const weekMax = Math.max(DAILY_GOAL_XP, ...week.map(d => d.xp));
  const steps = last ? readJson<Record<string, { at: string; seen: string[] }>>('lesson-steps', {})[last] : undefined;

  if (!visited.length) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="bg-hero rounded-3xl border border-line p-8 text-center shadow-[var(--shadow-card)] animate-fade-up">
          <span className="bg-brand mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"><Icon name="sparkle" className="h-7 w-7" /></span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Welcome! Pick a starting point</h1>
          <p className="mt-2 text-ink-2">Your streak, XP and progress will show up here.</p>
          <div className="stagger mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
            {([['m01-software-engineering', 'Complete beginner', 'Module 1 · Foundations', 'layers'], ['m04-srp', 'I know C# & OOP', 'SOLID principles', 'code'], ['m06-strategy', 'Patterns please', 'Design patterns', 'atlas'], ['m11-hld-framework', 'Interview prep', 'HLD framework', 'globe']] as const).map(([id, who, what, icon]) => (
              <Link key={id} to={`/lesson/${id}`} className="lift flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name={icon} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-xs text-ink-3">{who}</span><span className="block font-semibold text-ink">{what}</span></span>
                <Icon name="arrowRight" className="h-4 w-4 text-ink-3" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const backupDays = daysSinceExport();
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      {/* ---------- hero: greeting + momentum ---------- */}
      <section className="bg-hero grid gap-6 rounded-3xl border border-line p-6 shadow-[var(--shadow-card)] md:grid-cols-[1fr_auto] animate-fade-up">
        <div className="flex items-center gap-5">
          <ProgressRing value={lv.pct} size={84} stroke={8} label="Progress to next level">
            <span className="flex flex-col items-center leading-none"><span className="text-[10px] font-medium text-ink-3">LEVEL</span><span className="text-2xl font-extrabold text-ink">{lv.level}</span></span>
          </ProgressRing>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{greeting()} 👋</h1>
            <p className="mt-0.5 text-ink-2"><span className="font-semibold text-accent">{levelTitle(lv.level)}</span> · {xp} XP · {lv.next - xp} XP to level {lv.level + 1}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <span className={cx('flex h-12 w-12 items-center justify-center rounded-2xl', st.activeToday ? 'bg-[color-mix(in_srgb,var(--color-flame)_15%,transparent)] text-flame' : 'bg-surface-2 text-ink-3')}><Icon name="flame" className="h-6 w-6" /></span>
            <div><div className="text-2xl font-bold leading-none tabular-nums text-ink">{st.days}</div><div className="text-xs text-ink-3">day streak{!st.activeToday && st.days > 0 ? ' · keep it alive!' : ''}</div></div>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={(today / DAILY_GOAL_XP) * 100} size={48} stroke={6} color="var(--color-ok)" label="Daily goal">
              {today >= DAILY_GOAL_XP ? <Icon name="check" className="h-5 w-5 text-ok" /> : <Icon name="target" className="h-4 w-4 text-ink-3" />}
            </ProgressRing>
            <div><div className="text-sm font-semibold text-ink tabular-nums">{Math.min(today, DAILY_GOAL_XP)}/{DAILY_GOAL_XP} XP</div><div className="text-xs text-ink-3">daily goal</div></div>
          </div>
          <div className="flex h-12 items-end gap-1" title="XP over the last 7 days" aria-label="XP over the last 7 days">
            {week.map(d => (
              <div key={d.key} className="flex flex-col items-center gap-0.5">
                <div className="flex h-9 w-3.5 items-end overflow-hidden rounded bg-surface-2"><div className={cx('w-full rounded', d.xp ? 'bg-brand' : d.active ? 'bg-accent/40' : '')} style={{ height: `${Math.max(d.active ? 12 : 0, (d.xp / weekMax) * 100)}%` }} /></div>
                <span className="text-[9px] text-ink-3">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {backupDays === null || backupDays >= 14 ? (
        <p className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn" role="note">
          <Icon name="flag" className="h-4 w-4 shrink-0" />
          <span>{backupDays === null ? 'No backup yet.' : `Last backup ${backupDays} days ago.`} Progress lives in this browser — <Link to="/settings" className="font-medium underline">export a backup</Link>.</span>
        </p>
      ) : null}

      {/* ---------- continue ---------- */}
      {last && lastMeta && (
        <Link to={`/lesson/${last}`} className="lift group flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: currentModule ? TRACK_COLOR[currentModule.track] : 'var(--color-accent)' }}><Icon name="play" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wider text-ink-3">Continue learning{currentModule ? ` · Module ${currentModule.number}` : ''}</div>
            <div className="truncate text-xl font-bold text-ink">{lastMeta.title}</div>
            {steps && steps.seen.length > 0 && <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3"><Icon name="layers" className="h-3.5 w-3.5" />{steps.seen.length} step{steps.seen.length === 1 ? '' : 's'} explored · picks up where you left off</div>}
          </div>
          <span className="bg-brand flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform group-hover:translate-x-0.5">{p.completed[last] ? 'Review' : 'Resume'}<Icon name="arrowRight" className="h-4 w-4" /></span>
        </Link>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="trophy" label="lessons done" value={completed.length} hint={`of ${writtenLessons.length}`} color="var(--color-accent)" />
        <StatTile icon="pen" label="exercises done" value={exercisesDone} color="var(--color-t-lld)" />
        <StatTile icon="exam" label="avg best quiz" value={avgBest === null ? '—' : `${avgBest}%`} color="var(--color-ok)" />
        <StatTile icon="clock" label="minutes learning" value={Math.round(totalSeconds / 60)} color="var(--color-flame)" />
      </div>

      {/* ---------- what next ---------- */}
      <Card title="Up next for you" icon="sparkle">
        {recs.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recs.slice(0, 6).map(r => {
              const m = moduleById.get(lessonById.get(r.lessonId)?.module ?? '');
              return (
                <li key={r.lessonId}>
                  <Link to={`/lesson/${r.lessonId}`} className="lift flex h-full flex-col gap-1.5 rounded-xl border border-line p-3" title={r.reason}>
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={r.kind === 'next' ? 'accent' : r.kind === 'revise' ? 'warn' : 'neutral'}>{r.kind === 'next' ? 'Next' : r.kind === 'revise' ? 'Revise' : 'Prerequisite'}</Badge>
                      {m && <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLOR[m.track] }} />}
                    </span>
                    <span className="text-sm font-semibold text-ink">{title(r.lessonId)}</span>
                    {m && <span className="text-xs text-ink-3">Module {m.number}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <Empty title="You have completed every written lesson 🎉" />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Flashcards" icon="cards" action={<Link to="/flashcards" className="text-xs font-medium text-accent">Review →</Link>}>
          <div className="flex items-center gap-4">
            <span className={cx('text-4xl font-extrabold tabular-nums', due.length ? 'text-accent' : 'text-ink-3')}>{due.length}</span>
            <span className="text-sm text-ink-2">due now<br /><span className="text-xs text-ink-3">{Object.keys(p.srs).length} cards in deck</span></span>
          </div>
        </Card>
        <Card title="Needs attention" icon="target" action={<Link to="/analytics" className="text-xs font-medium text-accent">Analytics →</Link>}>
          {weak.length ? <ul className="space-y-1.5">{weak.slice(0, 4).map(w => <li key={w.lessonId}><Link to={`/lesson/${w.lessonId}`} className="flex items-center gap-2 text-sm text-ink hover:text-accent" title={w.reason}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" /><span className="truncate">{title(w.lessonId)}</span></Link></li>)}</ul>
            : <p className="text-sm text-ink-3">Nothing flagged — nice work.</p>}
        </Card>
        <Card title="Unfinished exercises" icon="pen" action={<Link to="/practice" className="text-xs font-medium text-accent">Practice →</Link>}>
          {pending.length ? <ul className="space-y-1.5">{pending.slice(0, 4).map(([id, e]) => <li key={id}><Link to={`/lesson/${e.lessonId}?at=${id}`} className="flex items-center gap-2 text-sm text-ink hover:text-accent"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="truncate">{id}</span></Link></li>)}</ul>
            : <p className="text-sm text-ink-3">All caught up.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card title="Modules" icon="map" action={<Link to="/curriculum" className="text-xs font-medium text-accent">All →</Link>}>
          <ul className="space-y-2.5">
            {modules.filter(m => m.lessons.some(l => p.visits[l.id])).slice(0, 5).map(m => {
              const written = m.lessons.filter(l => l.hasContent).length;
              const done = m.lessons.filter(l => p.completed[l.id]).length;
              return (
                <li key={m.id}><Link to={`/curriculum?m=${m.id}`} className="block">
                  <div className="flex justify-between text-sm"><span className="truncate text-ink">{m.number}. {m.title}</span><span className="text-xs tabular-nums text-ink-3">{done}/{written}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${(done / Math.max(1, written)) * 100}%`, background: TRACK_COLOR[m.track] }} /></div>
                </Link></li>
              );
            })}
          </ul>
        </Card>
        <Card title="Recent activity" icon="clock">
          <ol className="relative space-y-3 border-l border-line pl-4">
            {p.activity.slice(0, 6).map((a, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[25px] flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-accent"><Icon name={ACTIVITY_ICON[a.kind] ?? 'book'} className="h-3 w-3" /></span>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-2">{a.lessonId ? <Link to={`/lesson/${a.lessonId}`} className="font-medium text-ink hover:text-accent">{title(a.lessonId)}</Link> : null}{a.lessonId ? ' · ' : ''}{a.detail}</span>
                  <span className="shrink-0 text-xs text-ink-3">{new Date(a.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div className="text-center"><ButtonLink to="/analytics" variant="ghost">See detailed analytics →</ButtonLink></div>
    </div>
  );
}
