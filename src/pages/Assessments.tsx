import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllLessons } from '../lib/useLessons';
import { actions, bestQuiz, useProgress } from '../lib/progress';
import { modules } from '../lib/content';
import type { InterviewQ, ParsedLesson, QuizQuestion } from '../lib/lessonParser';
import { Markdown } from '../components/Markdown';
import { Badge, Button, Card, Empty, LevelBadge, PageHeader, Select, Spinner, Tabs, cx } from '../components/ui';

function shuffle<T>(a: T[], seed = Date.now()): T[] {
  const r = [...a];
  let s = seed % 2147483647;
  for (let i = r.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

function useTimer(running: boolean) {
  const [sec, setSec] = useState(0);
  useEffect(() => { if (!running) return; const t = setInterval(() => setSec(s => s + 1), 1000); return () => clearInterval(t); }, [running]);
  return [sec, setSec] as const;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function QuizList({ lessons }: { lessons: ParsedLesson[] }) {
  const p = useProgress();
  const withQuiz = lessons.filter(l => l.quiz);
  if (!withQuiz.length) return <Empty title="No quizzes yet" />;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {withQuiz.map(l => {
        const best = bestQuiz(p, l.meta.id);
        return (
          <li key={l.meta.id}>
            <Link to={`/lesson/${l.meta.id}?at=knowledge-check`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
              <span className="min-w-0 flex-1 text-sm text-ink">{l.meta.title}</span>
              <span className="text-xs text-ink-3">{l.quiz!.questions.length} questions</span>
              {best ? <Badge tone={best.passed ? 'ok' : 'warn'}>Best {best.score}%</Badge> : <Badge>Not taken</Badge>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MockExam({ lessons }: { lessons: ParsedLesson[] }) {
  const [scope, setScope] = useState('all');
  const [size, setSize] = useState('10');
  const [exam, setExam] = useState<(QuizQuestion & { lessonId: string })[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [done, setDone] = useState(false);
  const [sec, setSec] = useTimer(!!exam && !done);
  const pool = useMemo(() => lessons.filter(l => scope === 'all' || l.meta.module === scope).flatMap(l => (l.quiz?.questions ?? []).map(q => ({ ...q, lessonId: l.meta.id }))), [lessons, scope]);
  const limit = Number(size) * 90;

  const start = () => { setExam(shuffle(pool).slice(0, Number(size))); setAnswers({}); setDone(false); setSec(0); };
  const right = (q: QuizQuestion) => [...(answers[q.id] ?? [])].sort().join() === [...q.answer].sort().join();
  const finish = () => {
    if (!exam) return;
    setDone(true);
    actions.recordExam({ correct: exam.filter(right).length, total: exam.length, seconds: sec, lessons: [...new Set(exam.map(q => q.lessonId))] });
  };
  useEffect(() => { if (exam && !done && sec >= limit) finish(); });

  if (!exam) return (
    <Card>
      <p className="text-sm text-ink-2">A timed exam sampled from the knowledge checks of written lessons (about 90 seconds per question). Results are saved to your history.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Select label="Scope" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All written lessons' }, ...modules.filter(m => lessons.some(l => l.meta.module === m.id && l.quiz)).map(m => ({ value: m.id, label: `${m.number}. ${m.title}` }))]} />
        <Select label="Questions" value={size} onChange={setSize} options={['5', '10', '20', '30'].map(v => ({ value: v, label: v }))} />
        <Button variant="primary" onClick={start} disabled={!pool.length}>Start exam</Button>
        <span className="text-xs text-ink-3">{pool.length} questions available</span>
      </div>
    </Card>
  );
  const score = exam.filter(right).length;
  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-10 flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-2 text-sm">
        <span>{done ? `Score: ${score}/${exam.length} (${Math.round((score / exam.length) * 100)}%)` : `${Object.keys(answers).length}/${exam.length} answered`}</span>
        <span className={cx('tabular-nums', !done && limit - sec < 60 ? 'text-bad' : 'text-ink-2')}>{done ? `Took ${mmss(sec)}` : `Time left ${mmss(Math.max(0, limit - sec))}`}</span>
      </div>
      {exam.map((q, i) => (
        <Card key={q.id}>
          <div className="mb-2 flex gap-2 text-sm font-medium text-ink"><span className="text-ink-3">{i + 1}.</span><Markdown text={q.prompt} className="prose-sm [&_p]:my-0" /></div>
          <div className="space-y-1">
            {q.options.map((o, oi) => {
              const sel = (answers[q.id] ?? []).includes(oi);
              return (
                <label key={oi} className={cx('flex cursor-pointer gap-2 rounded border px-3 py-1.5 text-sm', done && q.answer.includes(oi) ? 'border-ok/50 bg-ok-soft' : done && sel ? 'border-bad/50 bg-bad-soft' : sel ? 'border-accent bg-accent-soft' : 'border-line')}>
                  <input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={`x-${q.id}`} disabled={done} checked={sel} onChange={() => setAnswers(a => ({ ...a, [q.id]: q.kind === 'multi' ? (sel ? (a[q.id] ?? []).filter(x => x !== oi) : [...(a[q.id] ?? []), oi]) : [oi] }))} />
                  <Markdown text={o} className="prose-sm [&_p]:my-0" />
                </label>
              );
            })}
          </div>
          {done && <div className="mt-2 text-sm text-ink-2"><Markdown text={q.explanation} className="prose-sm" /><Link to={`/lesson/${q.lessonId}`} className="text-xs text-accent">Revise this lesson →</Link></div>}
        </Card>
      ))}
      <div className="flex gap-2">{!done ? <Button variant="primary" onClick={finish}>Finish exam</Button> : <Button onClick={() => setExam(null)}>New exam</Button>}</div>
    </div>
  );
}

const RUBRIC = ['Clarified requirements and stated assumptions', 'Gave a correct, specific core answer', 'Explained trade-offs and alternatives', 'Mentioned failure modes, testing or operations'];

function MockInterview({ lessons }: { lessons: ParsedLesson[] }) {
  const [level, setLevel] = useState('any');
  const pool = useMemo(() => lessons.flatMap(l => l.interview.map(q => ({ ...q, lessonId: l.meta.id, lessonTitle: l.meta.title }))).filter(q => level === 'any' || q.level === level), [lessons, level]);
  const [q, setQ] = useState<(InterviewQ & { lessonId: string; lessonTitle: string }) | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [draft, setDraft] = useState('');
  const [sec, setSec] = useTimer(!!q && !revealed);
  const seed = useRef(Date.now());
  const next = () => { seed.current += 7919; setQ(shuffle(pool, seed.current)[0] ?? null); setRevealed(false); setChecks([false, false, false, false]); setDraft(''); setSec(0); };
  const p = useProgress();

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-ink-2">You get a random interview question from the written lessons. Answer out loud or in the box (aim for 3–5 minutes), then reveal the model answer and score yourself honestly against the rubric.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Select label="Level" value={level} onChange={setLevel} options={[{ value: 'any', label: 'Any level' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
          <Button variant="primary" onClick={next} disabled={!pool.length}>{q ? 'Next question' : 'Start'}</Button>
          <span className="text-xs text-ink-3">{pool.length} questions available · {p.interviews.length} answered so far</span>
        </div>
      </Card>
      {q && (
        <Card>
          <div className="flex items-center justify-between gap-2 text-xs text-ink-3"><span className="flex items-center gap-2"><LevelBadge level={q.level} />From {q.lessonTitle}</span><span className="tabular-nums">{mmss(sec)}</span></div>
          <div className="mt-2 text-base font-medium"><Markdown text={q.question} /></div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={5} placeholder="Your answer (optional)" className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          {!revealed ? <Button className="mt-2" onClick={() => setRevealed(true)}>Reveal model answer</Button> : (
            <div className="mt-3 space-y-3">
              <div className="rounded-md bg-surface-2 p-3"><Markdown text={q.answer} className="prose-sm" /></div>
              <fieldset><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Self-score rubric</legend>
                {RUBRIC.map((r, i) => <label key={r} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={checks[i]} onChange={e => setChecks(c => c.map((x, j) => j === i ? e.target.checked : x))} />{r}</label>)}
              </fieldset>
              <Button variant="primary" onClick={() => { actions.recordInterview({ lessonId: q.lessonId, question: q.question.slice(0, 200), selfScore: checks.filter(Boolean).length, seconds: sec }); next(); }}>Save score ({checks.filter(Boolean).length}/4) and continue</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function Assessments() {
  const lessons = useAllLessons();
  const p = useProgress();
  const [tab, setTab] = useState<'quizzes' | 'exam' | 'interview' | 'history'>('quizzes');
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Assessment center">Lesson quizzes, timed mock exams and mock interviews. Coding assessments live in each lesson’s exercises; architecture exercises open in the HLD and LLD canvases.</PageHeader>
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ id: 'quizzes', label: 'Lesson quizzes' }, { id: 'exam', label: 'Mock exam' }, { id: 'interview', label: 'Mock interview' }, { id: 'history', label: 'History' }]} />
      {!lessons ? <Spinner /> : tab === 'quizzes' ? <QuizList lessons={lessons} /> : tab === 'exam' ? <MockExam lessons={lessons} /> : tab === 'interview' ? <MockInterview lessons={lessons} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Mock exams">{p.exams.length ? <ul className="space-y-1 text-sm">{p.exams.map(e => <li key={e.at} className="flex justify-between"><span>{new Date(e.at).toLocaleString()}</span><span className="tabular-nums">{e.correct}/{e.total} · {mmss(e.seconds)}</span></li>)}</ul> : <Empty title="No exams yet" />}</Card>
          <Card title="Mock interviews">{p.interviews.length ? <ul className="space-y-1 text-sm">{p.interviews.slice(0, 30).map(e => <li key={e.at} className="flex justify-between gap-2"><span className="min-w-0 truncate">{e.question}</span><span className="shrink-0 tabular-nums">{e.selfScore}/4</span></li>)}</ul> : <Empty title="No interview answers yet" />}</Card>
        </div>
      )}
    </div>
  );
}
