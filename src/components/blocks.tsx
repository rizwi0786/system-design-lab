import { useMemo, useState } from 'react';
import type { Block, Exercise, Flashcard, InterviewQ, Quiz } from '../lib/lessonParser';
import { actions, useProgress } from '../lib/progress';
import { cardId } from '../lib/srs';
import { Markdown, CodeBlock } from './Markdown';
import { Badge, Button, Icon, LevelBadge, cx, type IconName } from './ui';
import { CSharpEditor, HldPlayground, LldPlayground, Lazy, SimulatorLab, SqlPlayground, parseJsonBlock, sqlBlock } from './playgrounds';
import { buildProjectZip, downloadBlob } from '../lib/projectZip';
import { VisualBlock } from './Visuals';

// ---------------- callout ----------------
const CALLOUT: Record<string, { label: string; cls: string; icon: IconName; tone: string }> = {
  note: { label: 'Note', cls: 'border-line bg-surface-2', icon: 'note', tone: 'text-ink-2' },
  tip: { label: 'Tip', cls: 'border-ok/40 bg-ok-soft', icon: 'bulb', tone: 'text-ok' },
  warning: { label: 'Warning', cls: 'border-warn/40 bg-warn-soft', icon: 'flag', tone: 'text-warn' },
  tradeoff: { label: 'Trade-off', cls: 'border-accent/40 bg-accent-soft', icon: 'scale', tone: 'text-accent' },
  mistake: { label: 'Common mistake', cls: 'border-bad/40 bg-bad-soft', icon: 'bolt', tone: 'text-bad' },
};
export function Callout({ kind, title, text }: { kind: string; title: string; text: string }) {
  const c = CALLOUT[kind] ?? CALLOUT.note;
  return (
    <aside className={cx('not-prose my-5 rounded-2xl border p-4', c.cls)}>
      <div className={cx('mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide', c.tone)}><Icon name={c.icon} className="h-4 w-4" />{c.label}{title ? <span className="font-semibold normal-case tracking-normal text-ink"> — {title}</span> : ''}</div>
      <Markdown text={text} className="prose-sm" />
    </aside>
  );
}

// ---------------- quiz ----------------
export function QuizBlock({ lessonId, quiz }: { lessonId: string; quiz: Quiz }) {
  const progress = useProgress();
  const attempts = progress.quiz[lessonId] ?? [];
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const best = attempts.length ? Math.max(...attempts.map(a => a.score)) : null;

  const toggle = (qid: string, idx: number, multi: boolean) => {
    if (submitted) return;
    setAnswers(a => {
      const cur = a[qid] ?? [];
      return { ...a, [qid]: multi ? (cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx].sort()) : [idx] };
    });
  };
  const isRight = (qid: string) => {
    const q = quiz.questions.find(x => x.id === qid)!;
    const a = [...(answers[qid] ?? [])].sort().join(',');
    return a === [...q.answer].sort().join(',');
  };
  const answered = quiz.questions.filter(q => (answers[q.id] ?? []).length).length;
  const submit = () => {
    const correct = quiz.questions.filter(q => isRight(q.id)).length;
    const score = Math.round((correct / quiz.questions.length) * 100);
    actions.recordQuiz(lessonId, { correct, total: quiz.questions.length, score, passMark: quiz.passMark, passed: score >= quiz.passMark, answers });
    setSubmitted(true);
  };
  const correctCount = quiz.questions.filter(q => isRight(q.id)).length;
  const score = Math.round((correctCount / quiz.questions.length) * 100);

  return (
    <div className="not-prose my-4 space-y-4" data-testid="quiz">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <span>{quiz.questions.length} questions · pass mark {quiz.passMark}%</span>
        {best !== null && <Badge tone={best >= quiz.passMark ? 'ok' : 'warn'}>Best {best}% over {attempts.length} attempt{attempts.length > 1 ? 's' : ''}</Badge>}
      </div>
      <ol className="space-y-4">
        {quiz.questions.map((q, qi) => {
          const multi = q.kind === 'multi';
          const chosen = answers[q.id] ?? [];
          return (
            <li key={q.id} className="rounded-lg border border-line bg-surface p-4" data-testid="quiz-question">
              <div className="mb-2 flex gap-2 text-sm font-medium text-ink">
                <span className="text-ink-3">{qi + 1}.</span>
                <div className="min-w-0 flex-1"><Markdown text={q.prompt} className="prose-sm [&_p]:my-0" /></div>
              </div>
              {multi && <div className="mb-2 text-xs text-ink-3">Select all that apply.</div>}
              <div className="space-y-1.5" role={multi ? 'group' : 'radiogroup'}>
                {q.options.map((o, i) => {
                  const sel = chosen.includes(i);
                  const correct = q.answer.includes(i);
                  return (
                    <label key={i} className={cx('flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm',
                      !submitted && (sel ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'),
                      submitted && correct && 'border-ok/50 bg-ok-soft',
                      submitted && sel && !correct && 'border-bad/50 bg-bad-soft',
                      submitted && !sel && !correct && 'border-line opacity-70')}>
                      <input type={multi ? 'checkbox' : 'radio'} name={q.id} checked={sel} disabled={submitted} onChange={() => toggle(q.id, i, multi)} className="mt-0.5 accent-[var(--color-accent)]" />
                      <span className="min-w-0 flex-1"><Markdown text={o} className="prose-sm [&_p]:my-0" /></span>
                      {submitted && correct && <span className="text-xs font-medium text-ok">correct</span>}
                    </label>
                  );
                })}
              </div>
              {submitted && (
                <div className={cx('mt-3 rounded-md p-3 text-sm', isRight(q.id) ? 'bg-ok-soft' : 'bg-bad-soft')}>
                  <div className={cx('mb-1 font-medium', isRight(q.id) ? 'text-ok' : 'text-bad')}>{isRight(q.id) ? 'Correct' : 'Not quite'}</div>
                  <Markdown text={q.explanation} className="prose-sm [&_p]:my-0" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {!submitted ? (
          <>
            <Button variant="primary" onClick={submit} disabled={answered < quiz.questions.length}>Submit answers</Button>
            <span className="text-xs text-ink-3">{answered}/{quiz.questions.length} answered</span>
          </>
        ) : (
          <>
            <div className={cx('text-sm font-semibold', score >= quiz.passMark ? 'text-ok' : 'text-bad')} data-testid="quiz-score">
              You scored {score}% ({correctCount}/{quiz.questions.length}) — {score >= quiz.passMark ? 'passed' : `pass mark is ${quiz.passMark}%`}
            </div>
            <Button onClick={() => { setAnswers({}); setSubmitted(false); }}>Try again</Button>
          </>
        )}
      </div>
      {attempts.length > 0 && (
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer">Attempt history</summary>
          <ul className="mt-1 space-y-0.5">{[...attempts].reverse().map(a => <li key={a.at}>{new Date(a.at).toLocaleString()} — {a.score}% ({a.correct}/{a.total}){a.passed ? ' ✓' : ''}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

// ---------------- exercise ----------------
const KIND_LABEL: Record<string, string> = { code: 'C# code', design: 'LLD design', hld: 'HLD design', sql: 'SQL', written: 'Written' };

export function ExerciseBlock({ lessonId, exercise: ex }: { lessonId: string; exercise: Exercise }) {
  const progress = useProgress();
  const rec = progress.exercises[ex.id];
  const hintsShown = rec?.hintsUsed ?? 0;
  const [confirmSolution, setConfirmSolution] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [open, setOpen] = useState<null | 'editor' | 'playground'>(null);
  const note = progress.exerciseNotes[ex.id] ?? '';
  const [busy, setBusy] = useState(false);

  const hldInitial = useMemo(() => parseJsonBlock(ex.starter.find(f => f.language === 'json')?.code ?? ex.description), [ex]);
  const reference = useMemo(() => parseJsonBlock(ex.solution), [ex]);
  const csFiles = ex.starter.filter(f => ['csharp', 'cs'].includes(f.language));

  const download = async () => {
    setBusy(true);
    try {
      const saved = (await import('../lib/storage')).readJson<Record<string, string>>(`code:${ex.id}`, {});
      const blob = await buildProjectZip({ title: ex.title, exerciseId: ex.id, lessonId, description: ex.description, acceptance: ex.acceptance, files: csFiles.map(f => ({ ...f, code: saved[f.name] ?? f.code })), tests: ex.tests });
      downloadBlob(blob, `${ex.id}.zip`);
    } finally { setBusy(false); }
  };

  return (
    <article id={ex.id} className="not-prose my-6 scroll-mt-20 rounded-lg border border-line bg-surface" data-testid="exercise">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">{ex.title}</h3>
          <LevelBadge level={ex.difficulty} />
          <Badge>{KIND_LABEL[ex.kind] ?? ex.kind}</Badge>
          {rec?.done && <Badge tone="ok">Done{rec.autoChecked ? ' · auto-checked' : ''}</Badge>}
        </div>
        <Button size="sm" variant={rec?.done ? 'secondary' : 'primary'} onClick={() => actions.markExercise(ex.id, lessonId, !rec?.done)}>
          {rec?.done ? 'Mark as not done' : 'Mark as done'}
        </Button>
      </header>
      <div className="space-y-4 px-4 py-4">
        <Markdown text={ex.description} className="prose-sm" />
        {ex.requirements && <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Requirements</h4><Markdown text={ex.requirements} className="prose-sm" /></div>}
        {ex.acceptance.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Acceptance criteria</h4>
            <ul className="space-y-1 text-sm text-ink">{ex.acceptance.map((a, i) => <li key={i} className="flex gap-2"><span className="text-ink-3">☐</span><span className="min-w-0"><Markdown text={a} className="prose-sm [&_p]:my-0" /></span></li>)}</ul>
          </div>
        )}

        {ex.kind === 'code' && csFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setOpen(open === 'editor' ? null : 'editor')}>{open === 'editor' ? 'Close editor' : 'Open in editor'}</Button>
            <Button size="sm" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download .NET project'}</Button>
            <span className="text-xs text-ink-3">{ex.tests.length} test file{ex.tests.length === 1 ? '' : 's'} included · runs with <code>dotnet test</code> on your machine</span>
          </div>
        )}
        {ex.kind === 'code' && open === 'editor' && (
          <Lazy label="code editor"><CSharpEditor storageKey={ex.id} files={csFiles} tests={ex.tests} title={ex.title} exerciseId={ex.id} lessonId={lessonId} description={ex.description} acceptance={ex.acceptance} /></Lazy>
        )}
        {ex.kind === 'code' && csFiles.length === 0 && ex.starter.length === 0 && <p className="text-xs text-ink-3">No starter code — write your answer in your own project or in the notes box below.</p>}

        {ex.kind === 'sql' && ex.sqlSetup && (
          <Lazy label="SQL playground">
            <SqlPlayground setupSql={ex.sqlSetup} storageKey={ex.id} title={ex.title} compact
              exercise={{ id: ex.id, solutionSql: ex.sqlSolution ?? '', ordered: ex.ordered }}
              onCheck={(passed: boolean) => { if (passed && !progress.exercises[ex.id]?.done) actions.markExercise(ex.id, lessonId, true, true); }} />
          </Lazy>
        )}
        {(ex.kind === 'hld' || ex.kind === 'design') && (
          <div>
            <Button size="sm" onClick={() => setOpen(open === 'playground' ? null : 'playground')}>{open === 'playground' ? 'Close canvas' : ex.kind === 'hld' ? 'Open HLD canvas' : 'Open LLD designer'}</Button>
            {open === 'playground' && (
              <div className="mt-3">
                <Lazy label="design canvas">
                  {ex.kind === 'hld'
                    ? <HldPlayground storageKey={`ex:${ex.id}`} initial={hldInitial as never} reference={showSolution ? reference as never : undefined} title={ex.title} compact />
                    : <LldPlayground storageKey={`ex:${ex.id}`} initial={hldInitial as never} reference={showSolution ? reference as never : undefined} title={ex.title} compact />}
                </Lazy>
                {!showSolution && reference !== undefined && <p className="mt-1 text-xs text-ink-3">Reveal the solution below to compare your design with the reference.</p>}
              </div>
            )}
          </div>
        )}

        {ex.hints.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Hints ({hintsShown}/{ex.hints.length} shown)</h4>
            <ol className="space-y-2">
              {ex.hints.slice(0, hintsShown).map((h, i) => (
                <li key={i} className="rounded-md border border-line bg-surface-2 p-3"><div className="mb-1 text-xs text-ink-3">Hint {i + 1}</div><Markdown text={h} className="prose-sm [&_p]:my-0" /></li>
              ))}
            </ol>
            {hintsShown < ex.hints.length && (
              <Button size="sm" className="mt-2" onClick={() => actions.revealHint(ex.id, lessonId, hintsShown + 1)}>
                {hintsShown === 0 ? 'Show first hint' : `Show hint ${hintsShown + 1}`}
              </Button>
            )}
            <p className="mt-1 text-xs text-ink-3">Using hints never lowers your score.</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3" htmlFor={`note-${ex.id}`}>My answer / notes</label>
          <textarea id={`note-${ex.id}`} value={note} onChange={e => actions.setExerciseNote(ex.id, e.target.value)} rows={3}
            placeholder="Sketch your approach, paste your code, or note what you learned. Saved automatically."
            className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-3" />
        </div>

        <div className="border-t border-line pt-3">
          {!showSolution && !confirmSolution && <Button size="sm" variant="ghost" onClick={() => setConfirmSolution(true)}>Show solution</Button>}
          {confirmSolution && !showSolution && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft p-3 text-sm text-warn" role="alertdialog" aria-label="Confirm showing solution">
              <span>Seeing the solution before trying makes it harder to learn. {hintsShown < ex.hints.length ? 'There are still hints left.' : ''} Show it anyway?</span>
              <Button size="sm" variant="primary" onClick={() => { setShowSolution(true); setConfirmSolution(false); actions.updateExercise(ex.id, lessonId, { solutionViewed: true }, { kind: 'solution', lessonId, detail: `Viewed solution for ${ex.id}` }); }}>Yes, show solution</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmSolution(false)}>Cancel</Button>
            </div>
          )}
          {showSolution && (
            <div className="space-y-4" data-testid="solution">
              <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Solution</h4><Markdown text={ex.solution} className="prose-sm" /></div>
              {ex.kind === 'sql' && ex.sqlSolution && <CodeBlock code={ex.sqlSolution} lang="sql" title="Reference query" />}
              {ex.alternatives && <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Alternative solutions</h4><Markdown text={ex.alternatives} className="prose-sm" /></div>}
              {ex.mistakes.length > 0 && <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Common mistakes</h4><ul className="list-disc space-y-1 pl-5 text-sm text-ink">{ex.mistakes.map((m, i) => <li key={i}><Markdown text={m} className="prose-sm [&_p]:my-0" /></li>)}</ul></div>}
              {ex.extensions && <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Extension challenges</h4><Markdown text={ex.extensions} className="prose-sm" /></div>}
              <Button size="sm" variant="ghost" onClick={() => setShowSolution(false)}>Hide solution</Button>
            </div>
          )}
        </div>
        {ex.tests.length > 0 && !showSolution && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-3">Test cases ({ex.tests.length} file{ex.tests.length > 1 ? 's' : ''})</summary>
            {ex.tests.map(t => <CodeBlock key={t.name} code={t.code} lang="csharp" title={t.name} />)}
          </details>
        )}
      </div>
    </article>
  );
}

// ---------------- flashcards ----------------
export function FlashcardsBlock({ lessonId, cards }: { lessonId: string; cards: Flashcard[] }) {
  const progress = useProgress();
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const ids = cards.map(c => cardId(lessonId, c.front));
  const inReview = ids.filter(id => progress.srs[id]).length;
  return (
    <div className="not-prose my-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-2">{cards.length} flashcards · click a card to flip it</span>
        <Button size="sm" variant={inReview === ids.length ? 'secondary' : 'primary'} disabled={inReview === ids.length} onClick={() => actions.addCards(lessonId, ids)}>
          {inReview === ids.length ? 'All in your review deck' : inReview ? `Add ${ids.length - inReview} more to review` : 'Add to spaced-repetition review'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c, i) => (
          <button key={i} onClick={() => setFlipped(f => ({ ...f, [i]: !f[i] }))} aria-pressed={!!flipped[i]}
            className={cx('min-h-24 rounded-lg border p-4 text-left text-sm transition-colors', flipped[i] ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-3">{flipped[i] ? 'Answer' : 'Question'}</div>
            <Markdown text={flipped[i] ? c.back : c.front} className="prose-sm [&_p]:my-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------- interview ----------------
export function InterviewBlock({ questions }: { questions: InterviewQ[] }) {
  return (
    <div className="not-prose my-4 space-y-2">
      {questions.map((q, i) => (
        <details key={i} className="group rounded-lg border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-start gap-2 p-3 text-sm font-medium text-ink">
            <LevelBadge level={q.level} />
            <span className="min-w-0 flex-1"><Markdown text={q.question} className="prose-sm [&_p]:my-0" /></span>
            <span className="text-xs text-accent group-open:hidden">Show answer</span>
          </summary>
          <div className="border-t border-line p-3"><Markdown text={q.answer} className="prose-sm" /></div>
        </details>
      ))}
    </div>
  );
}

// ---------------- playground block ----------------
export function PlaygroundBlock({ lessonId, block }: { lessonId: string; block: Extract<Block, { type: 'playground' }> }) {
  const key = `pg:${lessonId}:${block.attrs.id ?? block.kind}`;
  const title = block.attrs.title;
  const header = title && <div className="mb-2 text-sm font-medium text-ink">{title}</div>;
  switch (block.kind) {
    case 'csharp': {
      const files = block.files.filter(f => ['csharp', 'cs'].includes(f.language));
      return <div className="my-4">{header}<Lazy label="code editor"><CSharpEditor storageKey={key} files={files} title={title ?? 'Playground'} exerciseId={`${lessonId}-playground`} lessonId={lessonId} height={380} /></Lazy></div>;
    }
    case 'sql': return <div className="my-4"><Lazy label="SQL playground"><SqlPlayground setupSql={sqlBlock(block.body)} storageKey={key} title={title} compact /></Lazy></div>;
    case 'hld': return <div className="my-4"><Lazy label="HLD canvas"><HldPlayground storageKey={key} initial={parseJsonBlock(block.body) as never} title={title} compact /></Lazy></div>;
    case 'lld': return <div className="my-4"><Lazy label="LLD designer"><LldPlayground storageKey={key} initial={parseJsonBlock(block.body) as never} title={title} compact /></Lazy></div>;
    case 'sim': return <div className="my-4">{header}<Lazy label="simulator"><SimulatorLab sim={block.attrs.sim as never} attrs={block.attrs} compact /></Lazy></div>;
    default: return <CodeBlock code={block.body} lang="plaintext" title={`Unsupported playground: ${block.kind}`} />;
  }
}

// ---------------- dispatcher ----------------
export function BlockView({ block, lessonId }: { block: Block; lessonId: string }) {
  switch (block.type) {
    case 'markdown': return <Markdown text={block.text} />;
    case 'callout': return <Callout kind={block.kind} title={block.title} text={block.text} />;
    case 'quiz': return <QuizBlock lessonId={lessonId} quiz={block.quiz} />;
    case 'exercise': return <ExerciseBlock lessonId={lessonId} exercise={block.exercise} />;
    case 'flashcards': return <FlashcardsBlock lessonId={lessonId} cards={block.cards} />;
    case 'interview': return <InterviewBlock questions={block.questions} />;
    case 'playground': return <PlaygroundBlock lessonId={lessonId} block={block} />;
    case 'visual': return <VisualBlock kind={block.kind} attrs={block.attrs} body={block.body} />;
    default: return <CodeBlock code={(block as { body: string }).body} lang="plaintext" title="Unrecognised block" />;
  }
}
