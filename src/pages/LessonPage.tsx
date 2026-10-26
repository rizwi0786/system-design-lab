import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { lessonById, loadLesson, moduleById, prevNext, TRACK_COLOR } from '../lib/content';
import type { ParsedLesson, Section } from '../lib/lessonParser';
import { actions, completionStatus, useProgress } from '../lib/progress';
import { useSettings, updateSettings } from '../lib/settings';
import { readJson, writeJson } from '../lib/storage';
import { chunkSection, chunkWithExercise, type Chunk } from '../lib/chunks';
import { BlockView } from '../components/blocks';
import { Badge, Button, Icon, LevelBadge, ProgressRing, StatusBadge, Spinner, cx, type IconName } from '../components/ui';

export default function LessonPage() {
  const { id = '' } = useParams();
  const meta = lessonById.get(id);
  const [lesson, setLesson] = useState<ParsedLesson | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setLesson(undefined);
    loadLesson(id).then(l => { if (alive) setLesson(l); });
    return () => { alive = false; };
  }, [id]);

  // Visit + time tracking (only while the tab is visible).
  useEffect(() => {
    if (!meta) return;
    actions.visit(id);
    let last = Date.now();
    const tick = () => { if (document.visibilityState === 'visible') actions.addTime(id, (Date.now() - last) / 1000); last = Date.now(); };
    const t = setInterval(tick, 30_000);
    const vis = () => { if (document.visibilityState === 'hidden') tick(); else last = Date.now(); };
    document.addEventListener('visibilitychange', vis);
    return () => { tick(); clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [id, meta]);

  if (!meta) return <div className="p-6"><h1 className="text-xl font-semibold">Lesson not found</h1><p className="mt-2 text-sm text-ink-2">No lesson with id “{id}”. <Link className="text-accent" to="/curriculum">Browse the curriculum</Link>.</p></div>;
  if (lesson === undefined && meta.hasContent) return <Spinner label="Loading lesson…" />;
  return lesson ? <LessonView key={lesson.meta.id} lesson={lesson} /> : <PlannedLesson id={id} />;
}

// ---------------- section look ----------------
const SECTION_ICON: [RegExp, IconName][] = [
  [/objective/, 'target'], [/prerequisite/, 'layers'], [/beginner|explain/, 'bulb'], [/first-principles|principle/, 'atlas'],
  [/visual|diagram/, 'eye'], [/step-by-step|walkthrough/, 'steps'], [/implementation|code|production/, 'code'], [/bad-design|good-design|vs/, 'scale'],
  [/playground/, 'flask'], [/exercise/, 'pen'], [/test/, 'test'], [/real-world|industry/, 'globe'], [/interview/, 'chat'],
  [/summary|revision/, 'star'], [/knowledge-check|quiz/, 'exam'], [/completion/, 'flag'],
];
const sectionIcon = (id: string): IconName => SECTION_ICON.find(([re]) => re.test(id))?.[1] ?? 'book';

// ---------------- per-lesson study position (resume where you left off) ----------------
interface StepState { at: string; seen: string[] }
const STEPS_KEY = 'lesson-steps';
const readSteps = (id: string): StepState | undefined => readJson<Record<string, StepState>>(STEPS_KEY, {})[id];
const writeSteps = (id: string, s: StepState) => writeJson(STEPS_KEY, { ...readJson<Record<string, StepState>>(STEPS_KEY, {}), [id]: s });

function PrereqList({ ids }: { ids: string[] }) {
  const progress = useProgress();
  if (!ids.length) return <span className="text-ink-3">None</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map(p => {
        const l = lessonById.get(p);
        const done = !!progress.completed[p];
        return <li key={p}><Link to={`/lesson/${p}`} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors', done ? 'border-ok/40 bg-ok-soft text-ok' : 'border-line text-ink-2 hover:border-accent/40 hover:bg-surface-2')}>{done ? '✓ ' : ''}{l?.title ?? p}</Link></li>;
      })}
    </ul>
  );
}

function PrevNext({ id }: { id: string }) {
  const { prev, next } = prevNext(id);
  return (
    <nav className="mt-10 grid gap-3 border-t border-line pt-6 sm:grid-cols-2" aria-label="Lesson navigation">
      {prev ? <Link to={`/lesson/${prev.id}`} className="lift rounded-2xl border border-line bg-surface p-4"><div className="flex items-center gap-1 text-xs text-ink-3"><Icon name="arrowLeft" className="h-3.5 w-3.5" /> Previous lesson</div><div className="mt-0.5 text-sm font-semibold text-ink">{prev.title}</div></Link> : <span />}
      {next && <Link to={`/lesson/${next.id}`} className="lift rounded-2xl border border-line bg-surface p-4 text-right"><div className="flex items-center justify-end gap-1 text-xs text-ink-3">Next lesson <Icon name="arrowRight" className="h-3.5 w-3.5" /></div><div className="mt-0.5 text-sm font-semibold text-ink">{next.title}</div></Link>}
    </nav>
  );
}

function PlannedLesson({ id }: { id: string }) {
  const meta = lessonById.get(id)!;
  const mod = moduleById.get(meta.module)!;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="text-xs text-ink-3">Module {mod.number} · {mod.title}</div>
      <h1 className="mt-1 text-2xl font-bold text-ink">{meta.title}</h1>
      <div className="mt-2 flex gap-2"><LevelBadge level={meta.level} /><StatusBadge status="planned" /></div>
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Coming soon</h2>
        <p className="mt-1 text-sm text-ink-2">This lesson isn’t written yet. It will cover:</p>
        {meta.topics.length > 0 && <ul className="mt-3 flex flex-wrap gap-1.5">{meta.topics.map(t => <li key={t}><Badge>{t}</Badge></li>)}</ul>}
        <p className="mt-4 text-sm text-ink-2">Meanwhile, try these written lessons from the same module:</p>
        <ul className="mt-1 space-y-1 text-sm">{mod.lessons.filter(l => l.hasContent).slice(0, 6).map(l => <li key={l.id}><Link className="text-accent" to={`/lesson/${l.id}`}>{l.title}</Link></li>)}{!mod.lessons.some(l => l.hasContent) && <li className="text-ink-3">None yet in this module.</li>}</ul>
      </div>
      <PrevNext id={id} />
    </div>
  );
}

function Confetti() {
  const colors = ['var(--color-accent)', 'var(--color-accent-2)', 'var(--color-ok)', 'var(--color-flame)', 'var(--color-t-foundations)'];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 12) * 60}ms`, animationDuration: `${1.4 + (i % 5) * 0.2}s` }} />)}
    </div>
  );
}

function LessonView({ lesson }: { lesson: ParsedLesson }) {
  const meta = lesson.meta;
  const manifest = lessonById.get(meta.id)!;
  const mod = moduleById.get(manifest.module);
  const progress = useProgress();
  const { lessonMode: mode } = useSettings();
  const location = useLocation();
  const status = completionStatus(progress, { id: meta.id, exercises: lesson.exercises.length }, !!lesson.quiz);
  const completed = !!progress.completed[meta.id];
  const incompletePrereqs = meta.prerequisites.filter(p => lessonById.get(p)?.hasContent && !progress.completed[p]);
  const bookmarked = progress.bookmarks.some(b => b.lessonId === meta.id && !b.sectionId);
  const objectives = lesson.sections.find(s => s.id === 'learning-objectives');
  const sections = lesson.sections;

  // Study position, restored per lesson.
  const saved = useMemo(() => readSteps(meta.id), [meta.id]);
  const [stepId, setStepId] = useState<string>(() => (saved && sections.some(s => s.id === saved.at) ? saved.at : sections[0]?.id ?? ''));
  const [seen, setSeen] = useState<Set<string>>(() => new Set(mode === 'study' ? [...(saved?.seen ?? []), stepId] : saved?.seen ?? []));
  const [openChunk, setOpenChunk] = useState<{ section: string; index: number } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const stepIndex = Math.max(0, sections.findIndex(s => s.id === stepId));

  useEffect(() => { writeSteps(meta.id, { at: stepId, seen: [...seen] }); }, [meta.id, stepId, seen]);

  const wasComplete = useRef(completed);
  useEffect(() => {
    if (status.complete && !completed) actions.markComplete(meta.id);
    if (status.complete && !wasComplete.current) { wasComplete.current = true; setCelebrate(true); const t = setTimeout(() => setCelebrate(false), 2600); return () => clearTimeout(t); }
  }, [status.complete, completed, meta.id]);

  const goTo = useCallback((id: string, scroll = true) => {
    setStepId(id);
    setSeen(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
    setOpenChunk(null);
    if (scroll) requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, []);

  // Deep links (?at=section-or-exercise-id): pick the right step and concept, then scroll to it.
  useEffect(() => {
    const at = new URLSearchParams(location.search).get('at');
    if (!at) return;
    if (mode === 'study') {
      const target = sections.find(s => s.id === at) ?? sections.find(s => s.blocks.some(b => b.type === 'exercise' && b.exercise.id === at));
      if (target) {
        setStepId(target.id);
        setSeen(prev => (prev.has(target.id) ? prev : new Set(prev).add(target.id)));
        const ci = chunkWithExercise(chunkSection(target.blocks), at);
        if (ci >= 0) setOpenChunk({ section: target.id, index: ci });
      }
    }
    const t = setTimeout(() => document.getElementById(at)?.scrollIntoView({ block: 'start' }), 80);
    return () => clearTimeout(t);
  }, [location.search, mode, sections]);

  // ← / → move between steps in Study mode (ignored while typing or inside an editor).
  useEffect(() => {
    if (mode !== 'study') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target;
      if (el instanceof Element && (el.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .react-flow'))) return;
      if (e.key === 'ArrowRight' && stepIndex < sections.length - 1) goTo(sections[stepIndex + 1].id);
      if (e.key === 'ArrowLeft' && stepIndex > 0) goTo(sections[stepIndex - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, stepIndex, sections, goTo]);

  const studyPct = sections.length ? (sections.filter(s => seen.has(s.id)).length / sections.length) * 100 : 0;
  const trackColor = mod ? TRACK_COLOR[mod.track] : 'var(--color-accent)';

  return (
    <div className="flex">
      {celebrate && <Confetti />}
      <article className="mx-auto min-w-0 max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {/* ---------- hero ---------- */}
        <header className="bg-hero relative overflow-hidden rounded-3xl border border-line p-5 shadow-[var(--shadow-card)] sm:p-7 animate-fade-up">
          <div className="flex items-center gap-1.5 text-xs text-ink-3">
            <Link to="/curriculum" className="hover:text-ink">Curriculum</Link><Icon name="chevron" className="h-3 w-3" />
            {mod && <Link to={`/curriculum?m=${mod.id}`} className="flex items-center gap-1.5 hover:text-ink"><span className="h-2 w-2 rounded-full" style={{ background: trackColor }} />Module {mod.number} · {mod.title}</Link>}
          </div>
          <div className="mt-3 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{meta.title}</h1>
              {meta.summary && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{meta.summary}</p>}
            </div>
            <ProgressRing value={completed ? 100 : studyPct} size={68} label="Lesson progress" color={completed ? 'var(--color-ok)' : 'var(--color-accent)'}>
              {completed ? <Icon name="check" className="h-6 w-6 text-ok" /> : undefined}
            </ProgressRing>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <LevelBadge level={meta.level} />
            <StatusBadge status={manifest.status} />
            <span className="flex items-center gap-1 rounded-full bg-surface/70 px-2 py-0.5"><Icon name="clock" className="h-3.5 w-3.5" />{meta.minutes} min</span>
            <span className="flex items-center gap-1 rounded-full bg-surface/70 px-2 py-0.5"><Icon name="pen" className="h-3.5 w-3.5" />{lesson.exercises.length} exercises</span>
            <span className="flex items-center gap-1 rounded-full bg-surface/70 px-2 py-0.5"><Icon name="layers" className="h-3.5 w-3.5" />{sections.length} steps</span>
            {completed && <Badge tone="ok">Completed</Badge>}
            <Button size="sm" variant="ghost" onClick={() => actions.toggleBookmark({ lessonId: meta.id, title: meta.title })} aria-pressed={bookmarked}>{bookmarked ? '★ Bookmarked' : '☆ Bookmark'}</Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div role="radiogroup" aria-label="Reading mode" className="inline-flex rounded-xl bg-surface/80 p-1 shadow-sm ring-1 ring-line">
              {([['study', 'Study mode', 'focus'], ['page', 'Full page', 'list']] as const).map(([m, label, icon]) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => updateSettings({ lessonMode: m })}
                  className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all', mode === m ? 'bg-brand font-medium text-white shadow-sm' : 'text-ink-2 hover:text-ink')}>
                  <Icon name={icon} className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
            {mode === 'study' && <span className="hidden text-xs text-ink-3 sm:block">Tip: use <kbd className="rounded border border-line bg-surface px-1">←</kbd> <kbd className="rounded border border-line bg-surface px-1">→</kbd> to move between steps</span>}
          </div>
        </header>

        {manifest.status === 'draft' && (
          <div className="mt-4 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm text-warn" role="note">
            <strong>Draft.</strong> Parts of this lesson may be incomplete.
            {manifest.problems.length > 0 && <details className="mt-1"><summary className="cursor-pointer">What is missing</summary><ul className="mt-1 list-disc pl-5">{manifest.problems.slice(0, 12).map(p => <li key={p}>{p}</li>)}</ul></details>}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CompletionPanel status={status} completed={completed} hasQuiz={!!lesson.quiz} onJump={id => { if (mode === 'study') goTo(id, false); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60); }} />
          <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Icon name="layers" className="h-3.5 w-3.5" />Prerequisites</div>
            <PrereqList ids={meta.prerequisites} />
            {incompletePrereqs.length > 0 && <p className="mt-2 text-xs text-warn">{incompletePrereqs.length} not completed yet — you can still read on.</p>}
          </div>
        </div>

        <div ref={topRef} className="scroll-mt-16" />
        {lesson.intro.length > 0 && (mode === 'page' || stepIndex === 0) && <div className="mt-6">{lesson.intro.map((b, i) => <BlockView key={i} block={b} lessonId={meta.id} />)}</div>}

        {mode === 'study' && sections.length > 0 ? (
          <StudyView lessonId={meta.id} lessonTitle={meta.title} sections={sections} index={stepIndex} seen={seen} goTo={goTo}
            openChunk={openChunk} setOpenChunk={setOpenChunk} />
        ) : (
          <>
            {sections.map(s => <FullSection key={s.id} lessonId={meta.id} lessonTitle={meta.title} section={s} />)}
            {meta.references.length > 0 && <References refs={meta.references} />}
          </>
        )}

        {mode === 'study' && stepIndex === sections.length - 1 && meta.references.length > 0 && <References refs={meta.references} />}
        <div className="xl:hidden"><NotesPanel lessonId={meta.id} /></div>
        <PrevNext id={meta.id} />
      </article>

      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto border-l border-line px-4 py-6 xl:block" aria-label="On this page">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{mode === 'study' ? 'Steps' : 'On this page'}</div>
        <TocList sections={sections} mode={mode} current={stepId} seen={seen} goTo={goTo} />
        {objectives && <ObjectivesMini text={objectives.blocks.map(b => (b.type === 'markdown' ? b.text : '')).join('\n')} />}
        <NotesPanel lessonId={meta.id} compact />
      </aside>
    </div>
  );
}

function References({ refs }: { refs: { title: string; url: string }[] }) {
  return (
    <section className="pt-8">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Icon name="book" className="h-5 w-5 text-accent" />References</h2>
      <ul className="mt-3 space-y-1.5 text-sm">{refs.map(r => <li key={r.url}><a href={r.url} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">{r.title} ↗</a></li>)}</ul>
    </section>
  );
}

function SectionBookmark({ lessonId, lessonTitle, section }: { lessonId: string; lessonTitle: string; section: Section }) {
  const progress = useProgress();
  const sb = progress.bookmarks.some(b => b.lessonId === lessonId && b.sectionId === section.id);
  return (
    <button onClick={() => actions.toggleBookmark({ lessonId, sectionId: section.id, title: `${lessonTitle} — ${section.title}` })}
      className={cx('shrink-0 rounded-md px-1.5 text-sm', sb ? 'text-accent' : 'text-ink-3 opacity-0 group-hover:opacity-100 focus:opacity-100')} aria-label={sb ? 'Remove section bookmark' : 'Bookmark this section'}>
      {sb ? '★' : '☆'}
    </button>
  );
}

function FullSection({ lessonId, lessonTitle, section: s }: { lessonId: string; lessonTitle: string; section: Section }) {
  return (
    <section id={s.id} className="scroll-mt-20 pt-8">
      <div className="group flex items-center justify-between gap-2 border-b border-line pb-2">
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={sectionIcon(s.id)} className="h-4 w-4" /></span>{s.title}
        </h2>
        <SectionBookmark lessonId={lessonId} lessonTitle={lessonTitle} section={s} />
      </div>
      <div className="pt-2">{s.blocks.map((b, i) => <BlockView key={i} block={b} lessonId={lessonId} />)}</div>
    </section>
  );
}

// ---------------- Study mode ----------------
function StepRail({ sections, index, seen, goTo }: { sections: Section[]; index: number; seen: Set<string>; goTo: (id: string) => void }) {
  const railRef = useRef<HTMLOListElement>(null);
  useEffect(() => { railRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [index]);
  return (
    <div className="sticky top-14 z-20 -mx-4 mt-6 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
      <ol ref={railRef} className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Lesson steps">
        {sections.map((s, i) => {
          const active = i === index;
          const done = seen.has(s.id) && !active;
          return (
            <li key={s.id} className="shrink-0">
              <button onClick={() => goTo(s.id)} aria-current={active ? 'step' : undefined} title={s.title}
                className={cx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all',
                  active ? 'bg-brand border-transparent font-semibold text-white shadow-sm' : done ? 'border-ok/30 bg-ok-soft text-ok' : 'border-line bg-surface text-ink-2 hover:border-accent/40 hover:text-ink')}>
                {done ? <Icon name="check" className="h-3.5 w-3.5" /> : <Icon name={sectionIcon(s.id)} className="h-3.5 w-3.5" />}
                <span className={cx('max-w-[9rem] truncate', !active && 'hidden md:inline')}>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="bg-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${((index + 1) / sections.length) * 100}%` }} /></div>
    </div>
  );
}

function StudyView({ lessonId, lessonTitle, sections, index, seen, goTo, openChunk, setOpenChunk }: {
  lessonId: string; lessonTitle: string; sections: Section[]; index: number; seen: Set<string>; goTo: (id: string) => void;
  openChunk: { section: string; index: number } | null; setOpenChunk: (c: { section: string; index: number } | null) => void;
}) {
  const s = sections[index];
  const chunks = useMemo(() => chunkSection(s.blocks), [s]);
  const prev = sections[index - 1];
  const next = sections[index + 1];
  return (
    <>
      <StepRail sections={sections} index={index} seen={seen} goTo={goTo} />
      <section key={s.id} id={s.id} className="mt-5 scroll-mt-32 animate-fade-up" aria-roledescription="step">
        <div className="group mb-3 flex items-center gap-3">
          <span className="bg-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"><Icon name={sectionIcon(s.id)} className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-ink-3">Step {index + 1} of {sections.length}</div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">{s.title}</h2>
          </div>
          <SectionBookmark lessonId={lessonId} lessonTitle={lessonTitle} section={s} />
        </div>
        <ChunkedContent lessonId={lessonId} sectionId={s.id} chunks={chunks} openChunk={openChunk} setOpenChunk={setOpenChunk} />
      </section>

      <nav className="mt-8 flex items-stretch gap-3" aria-label="Step navigation">
        {prev ? (
          <button onClick={() => goTo(prev.id)} className="lift flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left">
            <Icon name="arrowLeft" className="h-5 w-5 shrink-0 text-ink-3" />
            <span className="min-w-0"><span className="block text-xs text-ink-3">Back</span><span className="block truncate text-sm font-medium text-ink">{prev.title}</span></span>
          </button>
        ) : <span className="flex-1" />}
        {next ? (
          <button onClick={() => goTo(next.id)} className="bg-brand lift flex min-w-0 flex-[1.4] items-center justify-end gap-3 rounded-2xl p-3 text-right text-white shadow-sm">
            <span className="min-w-0"><span className="block text-xs text-white/80">Next step</span><span className="block truncate text-sm font-semibold">{next.title}</span></span>
            <Icon name="arrowRight" className="h-5 w-5 shrink-0" />
          </button>
        ) : (
          <div className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl border border-ok/40 bg-ok-soft p-3 text-sm font-semibold text-ok">
            <Icon name="trophy" className="h-5 w-5" /> You reached the last step
          </div>
        )}
      </nav>
    </>
  );
}

/** A section's content as a lead + collapsible "concept cards" (one open at a time) when it has subheadings. */
function ChunkedContent({ lessonId, sectionId, chunks, openChunk, setOpenChunk }: {
  lessonId: string; sectionId: string; chunks: Chunk[];
  openChunk: { section: string; index: number } | null; setOpenChunk: (c: { section: string; index: number } | null) => void;
}) {
  const [read, setRead] = useState<Set<number>>(new Set());
  const titled = chunks.filter(c => c.title !== null);
  if (titled.length < 2) return <div>{chunks.flatMap(c => c.blocks).map((b, i) => <BlockView key={i} block={b} lessonId={lessonId} />)}</div>;

  const lead = chunks[0].title === null ? chunks[0] : null;
  const cards = lead ? chunks.slice(1) : chunks;
  const open = openChunk?.section === sectionId ? openChunk.index : openChunk === null ? 0 : -1;
  const toggle = (i: number) => setOpenChunk(open === i ? { section: sectionId, index: -1 } : { section: sectionId, index: i });
  const gotIt = (i: number) => {
    setRead(r => new Set(r).add(i));
    setOpenChunk({ section: sectionId, index: i + 1 < cards.length ? i + 1 : -1 });
    setTimeout(() => document.getElementById(`${sectionId}-c${i + 1 < cards.length ? i + 1 : i}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  };

  return (
    <div>
      {lead && <div className="mb-4">{lead.blocks.map((b, i) => <BlockView key={i} block={b} lessonId={lessonId} />)}</div>}
      <div className="mb-2 flex items-center justify-between text-xs text-ink-3">
        <span>{cards.length} key ideas</span>
        <span className="tabular-nums">{read.size}/{cards.length} read</span>
      </div>
      <ol className="space-y-2.5">
        {cards.map((c, i) => {
          const isOpen = open === i;
          const isRead = read.has(i);
          return (
            <li key={i} id={`${sectionId}-c${i}`} className={cx('scroll-mt-32 overflow-hidden rounded-2xl border bg-surface transition-shadow', isOpen ? 'border-accent/40 shadow-[var(--shadow-lift)]' : 'border-line')}>
              <button onClick={() => toggle(i)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums', isRead ? 'bg-ok text-white dark:text-bg' : isOpen ? 'bg-brand text-white' : 'bg-surface-2 text-ink-2')}>
                  {isRead ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cx('min-w-0 flex-1 font-semibold', isOpen ? 'text-ink' : 'text-ink-2')}>{c.title}</span>
                <Icon name="chevron" className={cx('h-4 w-4 shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-90')} />
              </button>
              {isOpen && (
                <div className="border-t border-line px-4 pb-4 pt-1 animate-fade-up">
                  {c.blocks.map((b, bi) => <BlockView key={bi} block={b} lessonId={lessonId} />)}
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="primary" onClick={() => gotIt(i)}><Icon name="check" className="h-3.5 w-3.5" />{i + 1 < cards.length ? 'Got it — next idea' : 'Got it'}</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TocList({ sections, mode, current, seen, goTo }: { sections: Section[]; mode: string; current: string; seen: Set<string>; goTo: (id: string) => void }) {
  const [active, setActive] = useState('');
  useEffect(() => {
    if (mode !== 'page') return;
    const els = sections.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: '-80px 0px -70% 0px' });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [sections, mode]);
  const on = mode === 'study' ? current : active;
  return (
    <ul className="space-y-0.5 text-[13px]">
      {sections.map((t, i) => (
        <li key={t.id}>
          <a href={`#${t.id}`} onClick={e => { e.preventDefault(); if (mode === 'study') goTo(t.id); else document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}
            className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors', on === t.id ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums', mode === 'study' && seen.has(t.id) && on !== t.id ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-3')}>
              {mode === 'study' && seen.has(t.id) && on !== t.id ? '✓' : i + 1}
            </span>
            <span className="min-w-0 truncate">{t.title}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function ObjectivesMini({ text }: { text: string }) {
  const items = text.split('\n').map(l => l.match(/^\s*(?:\d+\.|[-*])\s+(.*)$/)?.[1]).filter(Boolean).slice(0, 8) as string[];
  if (!items.length) return null;
  return (
    <div className="mt-6 rounded-2xl bg-accent-soft/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent"><Icon name="target" className="h-3.5 w-3.5" />You will learn</div>
      <ul className="space-y-1.5 text-xs text-ink-2">{items.map((i, n) => <li key={n} className="flex gap-1.5"><Icon name="check" className="mt-0.5 h-3 w-3 shrink-0 text-accent" /><span>{i.replace(/[*`]/g, '')}</span></li>)}</ul>
    </div>
  );
}

function CompletionPanel({ status, completed, hasQuiz, onJump }: { status: ReturnType<typeof completionStatus>; completed: boolean; hasQuiz: boolean; onJump: (id: string) => void }) {
  const exOk = status.exercisesDone >= status.exercisesRequired;
  return (
    <div className={cx('rounded-2xl border p-4 text-sm', completed ? 'border-ok/40 bg-ok-soft' : 'border-line bg-surface')} data-testid="completion-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3"><Icon name="trophy" className="h-3.5 w-3.5" />Your goal</span>
        {completed && <span className="text-xs font-semibold text-ok">Completed ✓</span>}
      </div>
      <ul className="space-y-1.5">
        {hasQuiz && (
          <li className="flex items-center gap-2">
            <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', status.quizPassed ? 'bg-ok text-white dark:text-bg' : 'border border-line text-ink-3')}>{status.quizPassed ? '✓' : ''}</span>
            <span>Pass the <button className="font-medium text-accent hover:underline" onClick={() => onJump('knowledge-check')}>knowledge check</button>{status.bestScore !== null ? <span className="text-ink-3"> · best {status.bestScore}%</span> : ''}</span>
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', exOk ? 'bg-ok text-white dark:text-bg' : 'border border-line text-ink-3')}>{exOk ? '✓' : ''}</span>
          <span>Finish {status.exercisesRequired} <button className="font-medium text-accent hover:underline" onClick={() => onJump('exercises')}>exercises</button> <span className="text-ink-3">· {Math.min(status.exercisesDone, status.exercisesRequired)}/{status.exercisesRequired}</span></span>
        </li>
      </ul>
    </div>
  );
}

function NotesPanel({ lessonId, compact }: { lessonId: string; compact?: boolean }) {
  const progress = useProgress();
  const value = progress.notes[lessonId] ?? '';
  return (
    <div className={compact ? 'mt-6' : 'mt-10 rounded-2xl border border-line bg-surface p-4'}>
      <label htmlFor={`notes-${lessonId}-${compact ? 'c' : 'f'}`} className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3"><Icon name="note" className="h-3.5 w-3.5" />My notes</label>
      <textarea id={`notes-${lessonId}-${compact ? 'c' : 'f'}`} value={value} onChange={e => actions.setNote(lessonId, e.target.value)} rows={compact ? 8 : 5}
        placeholder="Jot down what clicked… (saved automatically)"
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent/50" />
    </div>
  );
}
