import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import { Button, Icon, cx } from './ui';
import { useSettings } from '../lib/settings';
import { parseCompare, parseFlow, parseStats, parseSteps, splitNumber, type FlowNode, type FlowRole, type VisualKind } from '../lib/visuals';

/** True when the OS or the in-app setting asks for reduced motion. */
export function useReducedMotion(): boolean {
  const settings = useSettings();
  const [os, setOs] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setOs(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return os || settings.reduceMotion;
}

/** Fires once when the element first scrolls into view (immediately where IntersectionObserver is missing). */
function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function Frame({ title, kicker, children, toolbar, className }: { title?: string; kicker: string; children: React.ReactNode; toolbar?: React.ReactNode; className?: string }) {
  return (
    <figure className={cx('not-prose my-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]', className)}>
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">{kicker}</span>
        {title && <span className="text-sm font-semibold text-ink">{title}</span>}
        <span className="flex-1" />
        {toolbar}
      </figcaption>
      {children}
    </figure>
  );
}

// ---------------- flow ----------------
const ROLE_STYLE: Record<FlowRole, { tag: string; color: string }> = {
  user: { tag: 'USER', color: 'var(--color-t-foundations)' },
  client: { tag: 'APP', color: 'var(--color-t-foundations)' },
  cdn: { tag: 'CDN', color: 'var(--color-t-foundations)' },
  lb: { tag: 'LB', color: 'var(--color-t-lld)' },
  gateway: { tag: 'GW', color: 'var(--color-t-lld)' },
  service: { tag: 'SVC', color: 'var(--color-accent)' },
  worker: { tag: 'JOB', color: 'var(--color-accent)' },
  cache: { tag: 'CACHE', color: 'var(--color-warn)' },
  db: { tag: 'DB', color: 'var(--color-ok)' },
  storage: { tag: 'BLOB', color: 'var(--color-ok)' },
  search: { tag: 'IDX', color: 'var(--color-ok)' },
  queue: { tag: 'QUEUE', color: 'var(--color-flame)' },
  external: { tag: 'EXT', color: 'var(--color-ink-3)' },
};
const COL_W = 200, ROW_H = 92, NODE_W = 156, NODE_H = 54, PAD = 20;

function nodeBox(n: FlowNode, rowsInCol: number, maxRows: number) {
  const offset = ((maxRows - rowsInCol) * ROW_H) / 2;
  return { x: PAD + n.col * COL_W, y: PAD + offset + n.row * ROW_H, w: NODE_W, h: NODE_H };
}

/** Curved path between two node boxes; return trips bow the other way so request and response never overlap. */
function edgePath(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, back: boolean) {
  const ay = a.y + a.h / 2, by = b.y + b.h / 2;
  if (Math.abs(a.x - b.x) < 1) { // same column: go around the right side
    const x = a.x + a.w, bend = 46;
    return `M ${x} ${ay} C ${x + bend} ${ay}, ${x + bend} ${by}, ${x} ${by}`;
  }
  const forward = b.x > a.x;
  const x1 = forward ? a.x + a.w : a.x, x2 = forward ? b.x : b.x + b.w;
  const bow = back ? 16 : -16;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${ay + (back ? 8 : -8)} C ${mx} ${ay + bow}, ${mx} ${by + bow}, ${x2} ${by + (back ? 8 : -8)}`;
}

export function FlowVisual({ body, title, initialView }: { body: string; title?: string; initialView?: string }) {
  const { flow, errors } = useMemo(() => parseFlow(body), [body]);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(-1); // -1 = overview, nothing highlighted
  const [playing, setPlaying] = useState(false);
  const [view3d, setView3d] = useState(initialView === '3d');
  const [ref, inView] = useInView<HTMLDivElement>();
  const last = flow.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), step < 0 ? 200 : 1700);
    return () => clearTimeout(t);
  }, [playing, step, last]);

  const play = useCallback(() => { if (step >= last) setStep(-1); setPlaying(true); }, [step, last]);

  if (errors.length) return <Frame kicker="flow" title={title}><pre className="p-4 text-xs text-bad">{errors.join('\n')}</pre></Frame>;

  const rowsPerCol = new Map<number, number>();
  for (const n of flow.nodes) rowsPerCol.set(n.col, (rowsPerCol.get(n.col) ?? 0) + 1);
  const maxRows = Math.max(...rowsPerCol.values());
  const cols = Math.max(...flow.nodes.map(n => n.col)) + 1;
  const boxes = new Map(flow.nodes.map(n => [n.id, nodeBox(n, rowsPerCol.get(n.col)!, maxRows)]));
  const width = PAD * 2 + (cols - 1) * COL_W + NODE_W + 40;
  const height = PAD * 2 + (maxRows - 1) * ROW_H + NODE_H;

  const seenPairs = new Set<string>();
  const edges = flow.steps.map((s, i) => {
    const back = seenPairs.has(`${s.to}>${s.from}`);
    seenPairs.add(`${s.from}>${s.to}`);
    return { ...s, i, d: edgePath(boxes.get(s.from)!, boxes.get(s.to)!, back) };
  });
  const cur = step >= 0 ? edges[step] : null;
  const active = new Set(cur ? [cur.from, cur.to] : []);
  const visited = new Set(edges.slice(0, step + 1).flatMap(e => [e.from, e.to]));

  const toolbar = (
    <div className="flex items-center gap-1">
      <IconBtn label="Previous step" icon="arrowLeft" onClick={() => { setPlaying(false); setStep(s => Math.max(-1, s - 1)); }} disabled={step < 0} />
      {playing
        ? <IconBtn label="Pause" icon="minimize" onClick={() => setPlaying(false)} />
        : <IconBtn label={step >= last ? 'Replay' : 'Play'} icon={step >= last ? 'undo' : 'play'} onClick={play} primary />}
      <IconBtn label="Next step" icon="arrowRight" onClick={() => { setPlaying(false); setStep(s => Math.min(last, s + 1)); }} disabled={step >= last} />
      <span className="mx-1 h-4 w-px bg-line" />
      <button onClick={() => setView3d(v => !v)} aria-pressed={view3d}
        className={cx('rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold', view3d ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:text-ink')}>
        {view3d ? '3D' : '2D'}
      </button>
    </div>
  );

  return (
    <Frame kicker="flow" title={title} toolbar={toolbar}>
      <div ref={ref} className={cx('flow-stage overflow-x-auto px-3 py-4', view3d && 'is-3d')}>
        <svg viewBox={`0 0 ${width} ${height}`} className="flow-board mx-auto block h-auto max-w-full" style={{ minWidth: Math.min(width, 560) }} role="img"
          aria-label={`${title ?? 'Request flow'}: ${flow.steps.map(s => `${s.from} to ${s.to}${s.label ? ` (${s.label})` : ''}`).join('; ')}`}>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--color-ink-3)" /></marker>
            <marker id="flow-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--color-accent)" /></marker>
          </defs>
          {edges.map(e => {
            const on = cur?.i === e.i, done = step > e.i;
            return <path key={e.i} d={e.d} fill="none" strokeWidth={on ? 2.4 : 1.4}
              stroke={on ? 'var(--color-accent)' : done ? 'var(--color-ink-3)' : 'var(--color-line)'}
              strokeDasharray={on || done ? undefined : '4 4'} markerEnd={`url(#${on ? 'flow-arrow-on' : 'flow-arrow'})`}
              className={cx('transition-[stroke] duration-300', on && !reduced && 'flow-edge-live')} />;
          })}
          {flow.nodes.map(n => {
            const b = boxes.get(n.id)!;
            const st = ROLE_STYLE[n.role];
            const isActive = active.has(n.id), wasVisited = visited.has(n.id);
            return (
              <g key={n.id} className={cx('flow-node transition-opacity duration-300', step >= 0 && !wasVisited && 'opacity-45')} style={inView && !reduced ? { animation: `fade-up .4s ${n.col * 80}ms both` } : undefined}>
                {view3d && <rect x={b.x + 6} y={b.y + 8} width={b.w} height={b.h} rx={12} fill={st.color} opacity={0.35} />}
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill="var(--color-surface)" stroke={isActive ? st.color : 'var(--color-line)'} strokeWidth={isActive ? 2.5 : 1.2} />
                <rect x={b.x} y={b.y} width={5} height={b.h} rx={2.5} fill={st.color} />
                <text x={b.x + 16} y={b.y + 20} fontSize="9.5" fontWeight={700} fill={st.color} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>{st.tag}</text>
                <text x={b.x + 16} y={b.y + 39} fontSize="13" fontWeight={600} fill="var(--color-ink)">{n.label.length > 19 ? `${n.label.slice(0, 18)}…` : n.label}<title>{n.label}</title></text>
                {isActive && !reduced && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill="none" stroke={st.color} strokeWidth={2} className="flow-pulse" />}
              </g>
            );
          })}
          {cur && (
            <circle key={`p${cur.i}`} r={6} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2}>
              {!reduced && <animateMotion dur="1.1s" fill="freeze" path={cur.d} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />}
              {reduced && <animateMotion dur="0.01s" fill="freeze" path={cur.d} />}
            </circle>
          )}
        </svg>
      </div>
      <div className="border-t border-line px-4 py-3" aria-live="polite">
        {cur ? (
          <div className="flex items-start gap-3 animate-fade-up" key={cur.i}>
            <span className="mt-0.5 shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-accent">{cur.i + 1}/{edges.length}</span>
            <div className="min-w-0 text-sm">
              <span className="font-mono text-xs text-ink-3">{labelOf(flow.nodes, cur.from)} → {labelOf(flow.nodes, cur.to)}</span>
              <div className="font-medium text-ink">{cur.label || '—'}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink-3"><Icon name="play" className="h-3.5 w-3.5" />Press play to send the request through the system, or step through it.</div>
        )}
        <details className="mt-2 text-xs text-ink-3">
          <summary className="cursor-pointer select-none">All {edges.length} steps</summary>
          <ol className="mt-1.5 space-y-0.5">
            {edges.map(e => (
              <li key={e.i}>
                <button onClick={() => { setPlaying(false); setStep(e.i); }} className={cx('text-left hover:text-ink', e.i === step && 'font-semibold text-accent')}>
                  <span className="font-mono tabular-nums">{e.i + 1}.</span> {labelOf(flow.nodes, e.from)} → {labelOf(flow.nodes, e.to)}{e.label ? `: ${e.label}` : ''}
                </button>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Frame>
  );
}
const labelOf = (nodes: FlowNode[], id: string) => nodes.find(n => n.id === id)?.label ?? id;

function IconBtn({ label, icon, onClick, disabled, primary }: { label: string; icon: 'arrowLeft' | 'arrowRight' | 'play' | 'minimize' | 'undo'; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={cx('flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-35',
        primary ? 'bg-brand text-white hover:brightness-110' : 'text-ink-2 hover:bg-surface hover:text-ink')}>
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------------- steps ----------------
export function StepsVisual({ body, title }: { body: string; title?: string }) {
  const { steps } = useMemo(() => parseSteps(body), [body]);
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  const toolbar = (
    <button onClick={() => setAll(a => !a)} className="text-xs font-medium text-ink-3 hover:text-ink">{all ? 'One at a time' : 'Show all'}</button>
  );
  if (all) {
    return (
      <Frame kicker="walkthrough" title={title} toolbar={toolbar}>
        <ol className="divide-y divide-line">
          {steps.map((s, k) => (
            <li key={k} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-bold text-accent">{k + 1}</span>
              <div className="min-w-0 flex-1"><div className="font-semibold text-ink">{s.title}</div><Markdown text={s.text} className="prose-sm" /></div>
            </li>
          ))}
        </ol>
      </Frame>
    );
  }
  const s = steps[i];
  return (
    <Frame kicker="walkthrough" title={title} toolbar={toolbar}>
      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {steps.map((_, k) => <button key={k} onClick={() => setI(k)} tabIndex={-1} className={cx('h-1.5 flex-1 rounded-full transition-colors', k <= i ? 'bg-brand' : 'bg-surface-2')} />)}
      </div>
      <div key={i} className="px-4 pb-2 pt-3 animate-fade-up">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-xs font-bold tabular-nums text-accent">{String(i + 1).padStart(2, '0')}/{String(steps.length).padStart(2, '0')}</span>
          <h4 className="text-base font-semibold text-ink">{s.title}</h4>
        </div>
        <Markdown text={s.text} className="prose-sm" />
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => setI(k => k - 1)} disabled={i === 0}><Icon name="arrowLeft" className="h-3.5 w-3.5" />Back</Button>
        {i < steps.length - 1
          ? <Button size="sm" variant="primary" onClick={() => setI(k => k + 1)}>Next: {steps[i + 1].title.length > 28 ? `${steps[i + 1].title.slice(0, 27)}…` : steps[i + 1].title}<Icon name="arrowRight" className="h-3.5 w-3.5" /></Button>
          : <Button size="sm" variant="ghost" onClick={() => setI(0)}><Icon name="undo" className="h-3.5 w-3.5" />Start over</Button>}
      </div>
    </Frame>
  );
}

// ---------------- compare ----------------
const TONE = {
  bad: { ring: 'border-bad/40', head: 'bg-bad-soft text-bad', mark: '✕' },
  good: { ring: 'border-ok/40', head: 'bg-ok-soft text-ok', mark: '✓' },
  neutral: { ring: 'border-line', head: 'bg-surface-2 text-ink-2', mark: '◆' },
} as const;
export function CompareVisual({ body, title }: { body: string; title?: string }) {
  const { sides } = useMemo(() => parseCompare(body), [body]);
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  return (
    <Frame kicker="compare" title={title}>
      <div ref={ref} className={cx('grid gap-3 p-3', sides.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {sides.map((s, k) => {
          const t = TONE[s.tone];
          return (
            <div key={k} className={cx('overflow-hidden rounded-xl border bg-surface', t.ring)} style={inView && !reduced ? { animation: `fade-up .4s ${k * 120}ms both` } : undefined}>
              <div className={cx('flex items-center gap-2 px-3 py-2 text-sm font-semibold', t.head)}><span className="font-mono">{t.mark}</span>{s.title}</div>
              <div className="px-3 pb-2"><Markdown text={s.text} className="prose-sm" /></div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

// ---------------- stats ----------------
function CountUp({ value, run }: { value: string; run: boolean }) {
  const { prefix, num, decimals, grouped, suffix } = splitNumber(value);
  const [shown, setShown] = useState(num === null ? null : run ? 0 : num);
  useEffect(() => {
    if (num === null || !run) { setShown(num); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setShown(num * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [num, run]);
  if (num === null || shown === null) return <>{value}</>;
  const text = grouped ? shown.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : shown.toFixed(decimals);
  return <>{prefix}{text}{suffix}</>;
}
export function StatsVisual({ body, title }: { body: string; title?: string }) {
  const { stats } = useMemo(() => parseStats(body), [body]);
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  return (
    <Frame kicker="numbers" title={title}>
      <div ref={ref} className={cx('grid gap-px bg-line', stats.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : stats.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
        {stats.map((s, k) => (
          <div key={k} className="bg-surface px-4 py-3">
            <div className="text-xs font-medium text-ink-3">{s.label}</div>
            <div className="mt-0.5 font-mono text-2xl font-bold tracking-tight text-ink tabular-nums">
              {inView ? <CountUp value={s.value} run={!reduced} /> : <span className="opacity-0">{s.value}</span>}
            </div>
            {s.note && <div className="mt-0.5 text-xs text-ink-2">{s.note}</div>}
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ---------------- tl;dr ----------------
export function TldrVisual({ body, title }: { body: string; title?: string }) {
  return (
    <aside className="not-prose my-6 rounded-2xl border border-accent/30 bg-accent-soft/60 p-4">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">
        <Icon name="sparkle" className="h-3.5 w-3.5" />{title || 'In short'}
      </div>
      <Markdown text={body} className="prose-sm [&_li]:my-0.5 [&_ul]:my-0" />
    </aside>
  );
}

export function VisualBlock({ kind, attrs, body }: { kind: VisualKind; attrs: Record<string, string>; body: string }) {
  switch (kind) {
    case 'flow': return <FlowVisual body={body} title={attrs.title} initialView={attrs.view} />;
    case 'steps': return <StepsVisual body={body} title={attrs.title} />;
    case 'compare': return <CompareVisual body={body} title={attrs.title} />;
    case 'stats': return <StatsVisual body={body} title={attrs.title} />;
    case 'tldr': return <TldrVisual body={body} title={attrs.title} />;
  }
}
