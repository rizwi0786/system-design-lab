// Full-page SQL playground: free play on three sample datasets plus ten graded challenges.
import { useState } from 'react';
import { readJson, writeJson } from '../../lib/storage';
import SqlPlayground from './SqlPlayground';
import { SQL_CHALLENGES } from './challenges';
import type { SqlChallenge } from './challenges';
import { SQL_DATASETS, datasetById } from './datasets';

const PROGRESS_KEY = 'sql:page:progress';
const MODE_KEY = 'sql:page:mode';

type Mode = { kind: 'free'; dataset: string } | { kind: 'challenge'; id: string };

const LEVEL_STYLE: Record<SqlChallenge['level'], string> = { beginner: 'bg-ok-soft text-ok', intermediate: 'bg-warn-soft text-warn', advanced: 'bg-bad-soft text-bad' };

/** Minimal inline formatting for prompts: `code` and **bold**. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith('`') ? <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.85em]">{p.slice(1, -1)}</code>
    : p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>)}</>;
}

export default function SqlPlaygroundPage() {
  const [mode, setModeState] = useState<Mode>(() => {
    const m = readJson<Mode>(MODE_KEY, { kind: 'challenge', id: SQL_CHALLENGES[0].id });
    if (m.kind === 'challenge' && SQL_CHALLENGES.some((c) => c.id === m.id)) return m;
    if (m.kind === 'free' && SQL_DATASETS.some((d) => d.id === m.dataset)) return m;
    return { kind: 'challenge', id: SQL_CHALLENGES[0].id };
  });
  const [passed, setPassed] = useState<string[]>(() => readJson<string[]>(PROGRESS_KEY, []));
  const [hintsShown, setHintsShown] = useState(0);
  const setMode = (m: Mode) => { setModeState(m); writeJson(MODE_KEY, m); setHintsShown(0); };

  const challenge = mode.kind === 'challenge' ? SQL_CHALLENGES.find((c) => c.id === mode.id)! : undefined;
  const dataset = datasetById(challenge ? challenge.dataset : mode.kind === 'free' ? mode.dataset : 'shop');
  const index = challenge ? SQL_CHALLENGES.indexOf(challenge) : -1;

  const markPassed = (ok: boolean) => {
    if (!ok || !challenge || passed.includes(challenge.id)) return;
    const next = [...passed, challenge.id];
    setPassed(next);
    writeJson(PROGRESS_KEY, next);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 text-ink">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">SQL playground</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          A real PostgreSQL database running inside your browser tab (PGlite, compiled to WebAssembly). Nothing is sent to a server, and
          every playground gets its own private copy of the data — break it freely, then press Reset database.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <nav aria-label="Datasets and challenges" className="space-y-4">
          <div>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Free play</h2>
            <ul className="space-y-1">
              {SQL_DATASETS.map((d) => {
                const active = mode.kind === 'free' && mode.dataset === d.id;
                return (
                  <li key={d.id}>
                    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => setMode({ kind: 'free', dataset: d.id })}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}>
                      <span className="block font-medium">{d.title}</span>
                      <span className="block text-xs text-ink-3">{d.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h2 className="mb-1.5 flex justify-between text-xs font-semibold uppercase tracking-wide text-ink-3">
              Challenges <span className="normal-case">{passed.length}/{SQL_CHALLENGES.length} solved</span>
            </h2>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={SQL_CHALLENGES.length} aria-valuenow={passed.length} aria-label="Challenges solved">
              <div className="h-full bg-ok" style={{ width: `${(passed.length / SQL_CHALLENGES.length) * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {SQL_CHALLENGES.map((c, i) => {
                const active = challenge?.id === c.id;
                const done = passed.includes(c.id);
                return (
                  <li key={c.id}>
                    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => setMode({ kind: 'challenge', id: c.id })}
                      className={`flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm ${active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}>
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? 'bg-ok text-surface' : 'bg-surface-2 text-ink-2'}`} aria-label={done ? 'solved' : undefined}>{done ? '✓' : i + 1}</span>
                      <span>
                        <span className="block font-medium">{c.title}</span>
                        <span className="block text-xs text-ink-3">{c.topic} · {datasetById(c.dataset).title}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>

        <main className="min-w-0 space-y-3">
          {challenge ? (
            <article className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-3">Challenge {index + 1} of {SQL_CHALLENGES.length}</span>
                <span className={`rounded px-1.5 py-0.5 font-medium ${LEVEL_STYLE[challenge.level]}`}>{challenge.level}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">{challenge.topic}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">dataset: {dataset.title}</span>
                {challenge.ordered && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">row order matters</span>}
                {passed.includes(challenge.id) && <span className="rounded bg-ok-soft px-1.5 py-0.5 font-medium text-ok">solved</span>}
              </div>
              <h2 className="text-lg font-semibold">{challenge.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-2"><Inline text={challenge.prompt} /></p>
              <div className="mt-3">
                {challenge.hints.slice(0, hintsShown).map((h, i) => (
                  <p key={i} className="mb-1 rounded-md bg-warn-soft px-2 py-1.5 text-xs text-ink"><b className="text-warn">Hint {i + 1}: </b><Inline text={h} /></p>
                ))}
                {hintsShown < challenge.hints.length && (
                  <button type="button" onClick={() => setHintsShown((n) => n + 1)}
                    className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2">
                    Show hint {hintsShown + 1} of {challenge.hints.length}
                  </button>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={index <= 0} onClick={() => setMode({ kind: 'challenge', id: SQL_CHALLENGES[index - 1].id })}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-40">← Previous</button>
                <button type="button" disabled={index >= SQL_CHALLENGES.length - 1} onClick={() => setMode({ kind: 'challenge', id: SQL_CHALLENGES[index + 1].id })}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-40">Next →</button>
              </div>
            </article>
          ) : (
            <article className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-lg font-semibold">{dataset.title} dataset</h2>
              <p className="mt-1 text-sm text-ink-2">{dataset.description}. Tables: {dataset.tables.map((t, i) => <span key={t}>{i > 0 && ', '}<code className="font-mono text-xs">{t}</code></span>)}. Open the Schema tab for columns and keys.</p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-accent">View the setup script</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[11px] text-ink">{dataset.setupSql}</pre>
              </details>
            </article>
          )}

          <SqlPlayground
            key={challenge ? challenge.id : `free-${dataset.id}`}
            setupSql={dataset.setupSql}
            storageKey={challenge ? `sql:challenge:${challenge.id}` : `sql:free:${dataset.id}`}
            title={challenge ? 'Your answer' : `${dataset.title} — free play`}
            exercise={challenge ? { id: challenge.id, solutionSql: challenge.solutionSql, ordered: challenge.ordered } : undefined}
            onCheck={markPassed}
          />
        </main>
      </div>
    </div>
  );
}
