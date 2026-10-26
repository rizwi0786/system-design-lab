// SQL Playground: a real PostgreSQL (PGlite, WebAssembly) per playground, with a Monaco editor, results,
// EXPLAIN plans, a schema browser with an ER diagram, query history and optional answer checking.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import Editor from '@monaco-editor/react';
import { monaco } from './monacoSetup';
import { readJson, writeJson } from '../../lib/storage';
import MermaidView from '../lld/MermaidView';
import { useIsDark } from '../lld/useIsDark';
import { checkAnswer, createDb, errorMessage, explainSql, loadSchema, runSql } from './engine';
import type { Db } from './engine';
import type { QueryResult } from './compare';
import { hintForError, positionToLineCol, schemaToMermaid, splitStatements } from './sqlUtils';
import type { SchemaTable } from './sqlUtils';

export { compareResults } from './compare';
export type { QueryResult } from './compare';

export interface SqlPlaygroundProps {
  setupSql: string;
  storageKey: string;
  title?: string;
  /** When given, a "Check answer" button compares the learner's result with `solutionSql` (never shown). */
  exercise?: { id: string; solutionSql: string; ordered?: boolean };
  onCheck?: (passed: boolean) => void;
  compact?: boolean;
}

type Output =
  | { kind: 'result'; result: QueryResult; ms: number; statementCount: number; hasRows: boolean }
  | { kind: 'error'; message: string; hint?: string; detail?: string; pgHint?: string; where?: { line: number; column: number } };
type Tab = 'results' | 'plan' | 'schema' | 'history';
interface HistoryItem { sql: string; at: string; ok: boolean; ms?: number }

const MAX_ROWS = 1000;
const NUMERIC_TYPES = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);
const btn = 'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function firstTable(setupSql: string): string | undefined {
  return /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/i.exec(setupSql)?.[1];
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return '\\x' + Array.from(v).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface PgError { message?: string; position?: string; detail?: string; hint?: string }

function cssVar(name: string, fallback: string) {
  // Monaco only accepts #rrggbb / #rrggbbaa; minified CSS may shorten tokens to #rgb.
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('');
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v : fallback;
  } catch { return fallback; }
}

function applyMonacoTheme(dark: boolean) {
  const name = dark ? 'sdlp-dark' : 'sdlp-light';
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs', inherit: true, rules: [],
    colors: {
      'editor.background': cssVar('--color-surface', dark ? '#1b1b19' : '#ffffff'),
      'editorLineNumber.foreground': cssVar('--color-ink-3', '#8a8a82'),
      'editorGutter.background': cssVar('--color-surface', dark ? '#1b1b19' : '#ffffff'),
    },
  });
  monaco.editor.setTheme(name);
  return name;
}

export default function SqlPlayground({ setupSql, storageKey, title, exercise, onCheck, compact = false }: SqlPlaygroundProps) {
  const uid = useId().replace(/[^\w]/g, '');
  const dark = useIsDark();
  const sqlKey = `${storageKey}:sql`;
  const historyKey = `${storageKey}:history`;
  const defaultSql = useMemo(() => {
    if (exercise) return '-- Write your answer here.\n-- Ctrl/Cmd+Enter runs it; "Check answer" compares it with the expected result.\n\n';
    const t = firstTable(setupSql);
    return t ? `SELECT *\nFROM ${t}\nLIMIT 10;\n` : 'SELECT version();\n';
  }, [exercise, setupSql]);

  const [sql, setSql] = useState<string>(() => readJson<string | null>(sqlKey, null) ?? defaultSql);
  const [status, setStatus] = useState<'booting' | 'ready' | 'failed'>('booting');
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const [busy, setBusy] = useState<null | 'run' | 'explain' | 'check' | 'reset'>(null);
  const [output, setOutput] = useState<Output | null>(null);
  const [plan, setPlan] = useState<{ text?: string; error?: string } | null>(null);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [showEr, setShowEr] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => readJson<HistoryItem[]>(historyKey, []));
  const [tab, setTab] = useState<Tab>('results');
  const [check, setCheck] = useState<{ passed: boolean; reason?: string; learnerError?: string } | null>(null);

  const dbRef = useRef<Db | null>(null);
  const checkDbRef = useRef<Promise<Db> | null>(null);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const actionsRef = useRef({ run: () => {} });

  // Save the editor contents (debounced).
  useEffect(() => {
    const t = setTimeout(() => writeJson(sqlKey, sql), 300);
    return () => clearTimeout(t);
  }, [sql, sqlKey]);

  // Boot (and re-boot on reset) a private in-memory database.
  useEffect(() => {
    let cancelled = false;
    let created: Db | null = null;
    setStatus('booting');
    setBootError(null);
    createDb(setupSql)
      .then(async (db) => {
        created = db;
        if (cancelled) { await db.close().catch(() => undefined); return; }
        dbRef.current = db;
        setSchema(await loadSchema(db).catch(() => []));
        setStatus('ready');
      })
      .catch((e) => { if (!cancelled) { setBootError(errorMessage(e)); setStatus('failed'); } })
      .finally(() => { if (!cancelled) setBusy((b) => (b === 'reset' ? null : b)); });
    return () => {
      cancelled = true;
      if (created) { void created.close().catch(() => undefined); }
      dbRef.current = null;
    };
  }, [setupSql, bootNonce]);

  // Dispose the answer-checking database on unmount or when the setup changes.
  useEffect(() => () => { void checkDbRef.current?.then((d) => d.close()).catch(() => undefined); checkDbRef.current = null; }, [setupSql]);

  useEffect(() => { if (editorRef.current) applyMonacoTheme(dark); }, [dark]);

  const clearMarkers = () => {
    const model = editorRef.current?.getModel();
    if (model) monaco.editor.setModelMarkers(model, 'sql', []);
  };

  const pushHistory = useCallback((item: HistoryItem) => {
    setHistory((h) => {
      const next = [item, ...h.filter((x) => x.sql !== item.sql)].slice(0, 20);
      writeJson(historyKey, next);
      return next;
    });
  }, [historyKey]);

  const showError = (e: unknown, text: string) => {
    const err = (e ?? {}) as PgError;
    const message = errorMessage(e);
    const statements = splitStatements(text);
    // Single statements run on their own, so the error position is relative to that statement.
    const offset = statements.length === 1 ? Math.max(0, text.indexOf(statements[0])) : 0;
    const pos = err.position ? Number(err.position) : NaN;
    const where = Number.isFinite(pos) ? positionToLineCol(text, pos + offset) : undefined;
    setOutput({ kind: 'error', message, hint: hintForError(message), detail: err.detail, pgHint: err.hint, where });
    const model = editorRef.current?.getModel();
    if (model && where) {
      monaco.editor.setModelMarkers(model, 'sql', [{
        startLineNumber: where.line, startColumn: where.column, endLineNumber: where.line, endColumn: model.getLineMaxColumn(where.line),
        message, severity: monaco.MarkerSeverity.Error,
      }]);
    }
  };

  const run = async () => {
    const db = dbRef.current;
    if (!db || busy) return;
    const text = editorRef.current?.getValue() ?? sql;
    clearMarkers();
    setBusy('run');
    setTab('results');
    const t0 = performance.now();
    try {
      const out = await runSql(db, text);
      const ms = performance.now() - t0;
      setOutput({ kind: 'result', result: out.result, ms, statementCount: out.statementCount, hasRows: out.hasRows });
      pushHistory({ sql: text.trim(), at: new Date().toISOString(), ok: true, ms: Math.round(ms * 10) / 10 });
      setSchema(await loadSchema(db).catch(() => schema));
    } catch (e) {
      showError(e, text);
      pushHistory({ sql: text.trim(), at: new Date().toISOString(), ok: false });
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => { actionsRef.current.run = () => { void run(); }; });

  const explain = async () => {
    const db = dbRef.current;
    if (!db || busy) return;
    const text = editorRef.current?.getValue() ?? sql;
    setBusy('explain');
    setTab('plan');
    try { setPlan({ text: await explainSql(db, text) }); } catch (e) { setPlan({ error: errorMessage(e) }); } finally { setBusy(null); }
  };

  const doCheck = async () => {
    if (!exercise || busy) return;
    const text = editorRef.current?.getValue() ?? sql;
    if (!splitStatements(text).length) { setCheck({ passed: false, reason: 'Write a query first.' }); return; }
    setBusy('check');
    try {
      // A separate pristine database, so earlier experiments in the editor cannot affect the check.
      checkDbRef.current ??= createDb(setupSql);
      const cdb = await checkDbRef.current;
      const r = await checkAnswer(cdb, text, exercise.solutionSql, !!exercise.ordered);
      if (r.dirty) { checkDbRef.current = null; void cdb.close().catch(() => undefined); }
      setCheck({ passed: r.passed, reason: r.reason, learnerError: r.learnerError });
      onCheck?.(r.passed);
    } catch (e) {
      checkDbRef.current = null;
      setCheck({ passed: false, reason: `Could not check the answer: ${errorMessage(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const resetDb = () => {
    if (busy) return;
    setBusy('reset');
    setOutput(null);
    setPlan(null);
    setCheck(null);
    clearMarkers();
    void checkDbRef.current?.then((d) => d.close()).catch(() => undefined);
    checkDbRef.current = null;
    setBootNonce((n) => n + 1);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    // Inside Monaco the editor's own keybinding handles it.
    if ((e.target as HTMLElement).closest?.('.monaco-editor')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run(); }
  };

  const ready = status === 'ready';
  const editorHeight = compact ? 180 : 260;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'results', label: 'Results' }, { id: 'plan', label: 'Query plan' }, { id: 'schema', label: `Schema${schema.length ? ` (${schema.length})` : ''}` }, { id: 'history', label: `History${history.length ? ` (${history.length})` : ''}` },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface text-ink" aria-label={title ?? 'SQL playground'} onKeyDown={onKeyDown}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        {title && <h3 className="mr-auto text-sm font-semibold">{title}</h3>}
        {!title && <span className="mr-auto text-xs text-ink-3">PostgreSQL · runs in your browser</span>}
        <StatusPill status={status} />
        <button type="button" className={primary} onClick={() => void run()} disabled={!ready || !!busy} title="Run (Ctrl/Cmd+Enter)">
          {busy === 'run' ? 'Running…' : 'Run'} <kbd className="rounded bg-surface/20 px-1 font-mono text-[10px]">⌘/Ctrl ↵</kbd>
        </button>
        <button type="button" className={btn} onClick={() => void explain()} disabled={!ready || !!busy}>{busy === 'explain' ? 'Explaining…' : 'Explain'}</button>
        {exercise && <button type="button" className={btn} onClick={() => void doCheck()} disabled={!ready || !!busy}>{busy === 'check' ? 'Checking…' : 'Check answer'}</button>}
        <button type="button" className={btn} onClick={resetDb} disabled={!!busy && busy !== 'reset'} title="Recreate the database from the setup script">Reset database</button>
      </header>

      <div className="relative border-b border-line" style={{ height: editorHeight }}>
        <Editor
          height={editorHeight}
          language="sql"
          value={sql}
          onChange={(v) => { setSql(v ?? ''); }}
          theme={dark ? 'sdlp-dark' : 'sdlp-light'}
          beforeMount={() => applyMonacoTheme(dark)}
          onMount={(editor) => {
            editorRef.current = editor;
            applyMonacoTheme(dark);
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => actionsRef.current.run());
            editor.onDidChangeModelContent(() => clearMarkers());
          }}
          loading={<div className="p-3 text-xs text-ink-3">Loading editor…</div>}
          options={{
            minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true,
            tabSize: 2, renderLineHighlight: 'line', fontFamily: 'JetBrains Mono, ui-monospace, Menlo, Consolas, monospace', padding: { top: 8 },
            ariaLabel: 'SQL editor. Press Control or Command plus Enter to run.',
          }}
        />
      </div>

      {check && (
        <div role="status" className={`flex items-start gap-2 border-b border-line px-3 py-2 text-sm ${check.passed ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
          <span className="font-semibold">{check.passed ? '✓ Correct' : '✗ Not yet'}</span>
          <span className="text-ink-2">
            {check.passed ? 'Your result matches the expected result.' : check.reason}
            {check.learnerError && <code className="ml-1 font-mono text-xs text-bad">{check.learnerError}</code>}
          </span>
        </div>
      )}

      <div role="tablist" aria-label="Output" className="flex overflow-x-auto border-b border-line bg-surface-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`${uid}-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`${uid}-panel`} onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium ${tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} className={`overflow-auto ${compact ? 'max-h-[300px] min-h-[140px]' : 'max-h-[420px] min-h-[180px]'}`} aria-live="polite">
        {status === 'booting' && <Booting />}
        {status === 'failed' && (
          <div className="m-3 rounded-md bg-bad-soft p-3 text-sm text-bad" role="alert">
            <p className="font-medium">The database could not start.</p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{bootError}</pre>
            <p className="mt-1 text-xs text-ink-2">If the setup script has an error, fix it and press Reset database. Very old browsers without WebAssembly are not supported.</p>
          </div>
        )}
        {ready && tab === 'results' && <ResultsPanel output={output} />}
        {ready && tab === 'plan' && <PlanPanel plan={plan} />}
        {ready && tab === 'schema' && <SchemaPanel schema={schema} showEr={showEr} setShowEr={setShowEr} />}
        {ready && tab === 'history' && (
          <HistoryPanel history={history} onPick={(s) => { setSql(s); editorRef.current?.setValue(s); editorRef.current?.focus(); }}
            onClear={() => { setHistory([]); writeJson(historyKey, []); }} />
        )}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: 'booting' | 'ready' | 'failed' }) {
  const map = { booting: ['bg-warn-soft text-warn', 'Starting…'], ready: ['bg-ok-soft text-ok', 'Ready'], failed: ['bg-bad-soft text-bad', 'Failed'] } as const;
  const [cls, text] = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`} aria-live="polite">{text}</span>;
}

function Booting() {
  return (
    <div className="flex items-center gap-3 p-4 text-sm text-ink-2" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
      Starting PostgreSQL in your browser and loading the sample data… The first start downloads a few MB; later starts are faster.
    </div>
  );
}

function ResultsPanel({ output }: { output: Output | null }) {
  if (!output) return <p className="p-3 text-sm text-ink-3">Run a query to see results here. Each playground has its own private database — nothing you do here affects anything else.</p>;
  if (output.kind === 'error') {
    return (
      <div className="m-3 space-y-2" role="alert">
        <div className="rounded-md bg-bad-soft p-3">
          <p className="font-mono text-sm text-bad">ERROR: {output.message}</p>
          {output.where && <p className="mt-1 text-xs text-ink-2">At line {output.where.line}, column {output.where.column} (underlined in the editor).</p>}
          {output.detail && <p className="mt-1 font-mono text-xs text-ink-2">DETAIL: {output.detail}</p>}
          {output.pgHint && <p className="mt-1 font-mono text-xs text-ink-2">HINT: {output.pgHint}</p>}
        </div>
        {output.hint && <p className="rounded-md bg-warn-soft p-2 text-xs text-ink"><b className="text-warn">Tip: </b>{output.hint}</p>}
      </div>
    );
  }
  const { result, ms, statementCount, hasRows } = output;
  const meta = (
    <p className="sticky left-0 px-3 py-1.5 text-xs text-ink-3">
      {hasRows ? `${result.rows.length} row${result.rows.length === 1 ? '' : 's'}` : result.affectedRows !== undefined ? `OK — ${result.affectedRows} row${result.affectedRows === 1 ? '' : 's'} affected` : 'OK'}
      {statementCount > 1 && ` · ${statementCount} statements (showing the last result set)`}
      {' · '}{ms.toFixed(1)} ms <span title="Wall-clock time measured in your browser, including WebAssembly overhead — not a server benchmark.">(measured in your browser)</span>
    </p>
  );
  if (!hasRows) return meta;
  const numeric = result.columns.map((_, i) => NUMERIC_TYPES.has(result.types?.[i] ?? -1));
  const shown = result.rows.slice(0, MAX_ROWS);
  return (
    <div>
      {meta}
      <table className="min-w-full border-collapse font-mono text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            <th scope="col" className="border-b border-line px-2 py-1 text-right font-normal text-ink-3">#</th>
            {result.columns.map((c, i) => <th key={i} scope="col" className={`border-b border-line px-3 py-1 font-semibold text-ink ${numeric[i] ? 'text-right' : 'text-left'}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="odd:bg-surface even:bg-bg hover:bg-accent-soft">
              <td className="border-b border-line px-2 py-1 text-right text-ink-3">{r + 1}</td>
              {row.map((v, i) => (
                <td key={i} className={`max-w-[360px] truncate border-b border-line px-3 py-1 ${numeric[i] ? 'text-right tabular-nums' : ''} ${v === null || v === undefined ? 'italic text-ink-3' : 'text-ink'}`} title={formatCell(v)}>{formatCell(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > MAX_ROWS && <p className="px-3 py-1.5 text-xs text-warn">Showing the first {MAX_ROWS} of {result.rows.length} rows.</p>}
    </div>
  );
}

function PlanPanel({ plan }: { plan: { text?: string; error?: string } | null }) {
  if (!plan) return <p className="p-3 text-sm text-ink-3">Press Explain to see how PostgreSQL executes the last statement in the editor (EXPLAIN ANALYZE — it really runs, inside a transaction that is rolled back).</p>;
  if (plan.error) return <p className="m-3 rounded-md bg-bad-soft p-3 font-mono text-sm text-bad" role="alert">{plan.error}</p>;
  return (
    <div className="p-3">
      <pre className="overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink">{plan.text}</pre>
      <p className="mt-2 text-xs text-ink-3">Read plans bottom-up: the most indented nodes run first. "actual time" is in milliseconds inside the WebAssembly engine; tiny tables often use Seq Scan even when an index exists, because reading a few pages is cheaper.</p>
    </div>
  );
}

function SchemaPanel({ schema, showEr, setShowEr }: { schema: SchemaTable[]; showEr: boolean; setShowEr: (v: boolean) => void }) {
  if (!schema.length) return <p className="p-3 text-sm text-ink-3">No tables yet. CREATE TABLE statements you run will appear here.</p>;
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-3">Tables in the <code>public</code> schema. PK = primary key, FK = foreign key.</p>
        <button type="button" className={btn} aria-pressed={showEr} onClick={() => setShowEr(!showEr)}>{showEr ? 'Hide ER diagram' : 'Show ER diagram'}</button>
      </div>
      {showEr && <div className="rounded-md border border-line p-2"><MermaidView source={schemaToMermaid(schema)} label="Entity relationship diagram" /></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {schema.map((t) => (
          <div key={t.name} className="rounded-md border border-line">
            <h4 className="border-b border-line bg-surface-2 px-2 py-1 font-mono text-xs font-semibold text-ink">{t.name}</h4>
            <ul className="divide-y divide-line">
              {t.columns.map((c) => (
                <li key={c.name} className="flex items-center gap-2 px-2 py-1 font-mono text-[11px]">
                  <span className={`text-ink ${c.pk ? 'font-semibold' : ''}`}>{c.name}</span>
                  <span className="text-ink-3">{c.type}{c.nullable ? '' : ' not null'}</span>
                  <span className="ml-auto flex gap-1">
                    {c.pk && <span className="rounded bg-accent-soft px-1 text-accent">PK</span>}
                    {c.fk && <span className="rounded bg-warn-soft px-1 text-warn" title={`references ${c.fk.table}(${c.fk.column})`}>FK → {c.fk.table}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({ history, onPick, onClear }: { history: HistoryItem[]; onPick: (sql: string) => void; onClear: () => void }) {
  if (!history.length) return <p className="p-3 text-sm text-ink-3">Queries you run appear here (last 20, saved in this browser).</p>;
  return (
    <div className="p-3">
      <div className="mb-2 flex justify-between"><p className="text-xs text-ink-3">Click a query to load it into the editor.</p><button type="button" className={btn} onClick={onClear}>Clear</button></div>
      <ul className="space-y-1.5">
        {history.map((h, i) => (
          <li key={i}>
            <button type="button" onClick={() => onPick(h.sql)} className="w-full rounded-md border border-line p-2 text-left hover:bg-surface-2">
              <span className="mb-1 flex gap-2 text-[11px] text-ink-3">
                <span className={h.ok ? 'text-ok' : 'text-bad'}>{h.ok ? 'ok' : 'error'}</span>
                <span>{new Date(h.at).toLocaleString()}</span>
                {h.ms !== undefined && <span>{h.ms} ms</span>}
              </span>
              <pre className="line-clamp-3 whitespace-pre-wrap font-mono text-xs text-ink">{h.sql}</pre>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
