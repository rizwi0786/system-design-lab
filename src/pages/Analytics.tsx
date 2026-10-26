import { Link } from 'react-router-dom';
import { modules, TRACK_LABEL, type Track } from '../lib/content';
import { MASTERY_FORMULA, lessonMastery, moduleMastery, useProgress, weakTopics, bestQuiz } from '../lib/progress';
import { lessonById } from '../lib/content';
import { Card, Empty, PageHeader, Progress, cx } from '../components/ui';

export default function Analytics() {
  const p = useProgress();
  const tracks = [...new Set(modules.map(m => m.track))] as Track[];
  const weak = weakTopics(p);
  const started = Object.keys(p.visits).filter(id => lessonById.get(id)?.hasContent);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Progress analytics">Mastery by track, module and lesson, computed only from what you did in this browser.</PageHeader>
      <Card className="mb-4" title="How mastery is calculated">
        <p className="text-sm text-ink-2">{MASTERY_FORMULA}</p>
        <p className="mt-2 text-sm text-ink-2">Module mastery is the average of its written lessons (unstarted lessons count as 0). A lesson is <em>complete</em> when you pass its quiz and finish two exercises. Weak topics: a best quiz score under the pass mark, an average of 3 or more hints per exercise, or flashcards forgotten twice.</p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {tracks.map(t => {
          const ls = modules.filter(m => m.track === t).flatMap(m => m.lessons);
          const mm = moduleMastery(p, ls);
          return <Card key={t} title={TRACK_LABEL[t]}><div className="text-2xl font-semibold tabular-nums text-ink">{mm.mastery}%</div><Progress className="mt-2" value={mm.mastery} /><div className="mt-1 text-xs text-ink-3">{mm.completed} completed · {mm.started}/{mm.written} written lessons started</div></Card>;
        })}
      </div>
      <Card className="mt-4" title="By module">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-3"><th className="py-1.5 font-medium">Module</th><th className="py-1.5 font-medium">Mastery</th><th className="hidden py-1.5 font-medium sm:table-cell">Started</th><th className="py-1.5 text-right font-medium">Completed</th></tr></thead>
          <tbody>
            {modules.map(m => {
              const mm = moduleMastery(p, m.lessons);
              return (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-2 pr-3"><Link to={`/curriculum?m=${m.id}`} className="text-ink hover:text-accent">{m.number}. {m.title}</Link>{!mm.written && <span className="ml-1 text-xs text-ink-3">(no lessons written yet)</span>}</td>
                  <td className="w-40 py-2 pr-3"><div className="flex items-center gap-2"><Progress value={mm.mastery} /><span className="w-9 text-right text-xs tabular-nums">{mm.mastery}%</span></div></td>
                  <td className="hidden py-2 text-xs tabular-nums text-ink-3 sm:table-cell">{mm.started}/{mm.written}</td>
                  <td className="py-2 text-right text-xs tabular-nums text-ink-3">{mm.completed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Lessons you have started">
          {started.length ? (
            <ul className="space-y-2">
              {started.map(id => {
                const l = lessonById.get(id)!;
                const m = lessonMastery(p, l);
                const q = bestQuiz(p, id);
                return <li key={id}><div className="flex justify-between gap-2 text-sm"><Link to={`/lesson/${id}`} className="min-w-0 truncate text-ink hover:text-accent">{l.title}</Link><span className={cx('tabular-nums', p.completed[id] ? 'text-ok' : 'text-ink-2')}>{m}%</span></div><div className="text-xs text-ink-3">quiz {q ? `${q.score}%` : '—'} · {Object.values(p.exercises).filter(e => e.lessonId === id && e.done).length}/{l.exercises} exercises · {Math.round((p.visits[id]?.seconds ?? 0) / 60)} min</div></li>;
              })}
            </ul>
          ) : <Empty title="No lessons started" />}
        </Card>
        <Card title="Areas to revise">
          {weak.length ? <ul className="space-y-2">{weak.map(w => <li key={w.lessonId}><Link to={`/lesson/${w.lessonId}`} className="text-sm text-ink hover:text-accent">{lessonById.get(w.lessonId)?.title}</Link><div className="text-xs text-ink-3">{w.reason}</div></li>)}</ul> : <Empty title="Nothing flagged yet" />}
        </Card>
      </div>
    </div>
  );
}
