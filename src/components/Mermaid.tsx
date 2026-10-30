import { useEffect, useId, useRef, useState } from 'react';
import { useSettings, isDark } from '../lib/settings';
import { useReducedMotion } from './Visuals';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let initialisedFor: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getMermaid(dark: boolean) {
  mermaidPromise ??= import('mermaid').then(m => m.default);
  const mermaid = await mermaidPromise;
  const key = dark ? 'dark' : 'light';
  if (initialisedFor !== key) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      flowchart: { htmlLabels: true, curve: 'basis' },
      themeVariables: dark ? { background: '#1b1b19', primaryColor: '#242421', primaryTextColor: '#ecece8', lineColor: '#85857d' } : {},
    });
    initialisedFor = key;
  }
  return mermaid;
}

/** Renders Mermaid source. Errors are shown as readable text next to the source; the page never crashes. */
export default function Mermaid({ source, caption }: { source: string; caption?: string }) {
  const settings = useSettings();
  const dark = isDark(settings.theme);
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Mermaid rendering is global-state heavy; serialise renders to avoid id collisions.
    queue = queue.then(async () => {
      try {
        const mermaid = await getMermaid(dark);
        const { svg } = await mermaid.render(`mmd-${rid}-${dark ? 'd' : 'l'}`, source.trim());
        if (!cancelled) { setSvg(svg); setError(null); }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message ?? String(e)); setSvg(null); }
        document.getElementById(`dmmd-${rid}-${dark ? 'd' : 'l'}`)?.remove();
      }
    });
    return () => { cancelled = true; };
  }, [source, dark, rid]);

  const kind = diagramKind(source);
  const reduced = useReducedMotion();
  const holder = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState(0);
  const [seq, setSeq] = useState<number | null>(null); // null = whole diagram; n = first n messages shown
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Draw the diagram in once, when it first scrolls into view.
  useEffect(() => {
    const el = holder.current;
    if (!svg || !el || reduced || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      io.disconnect();
      drawIn(el);
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [svg, reduced]);

  // Sequence diagrams: find message arrows + labels so they can be revealed one at a time.
  useEffect(() => {
    const el = holder.current;
    setSeq(null); setPlaying(false);
    if (!svg || !el || kind !== 'sequence') { setMessages(0); return; }
    setMessages(sequenceMessages(el)?.length ?? 0);
  }, [svg, kind]);

  useEffect(() => {
    const el = holder.current;
    const msgs = el ? sequenceMessages(el) : null;
    if (!msgs) return;
    msgs.forEach((parts, i) => parts.forEach(p => {
      p.classList.add('mmd-live');
      p.classList.toggle('mmd-dim', seq !== null && i >= seq);
    }));
  }, [seq, svg]);

  useEffect(() => {
    if (!playing || seq === null) return;
    if (seq >= messages) { setPlaying(false); return; }
    const t = setTimeout(() => setSeq(s => (s ?? 0) + 1), 1100);
    return () => clearTimeout(t);
  }, [playing, seq, messages]);

  return (
    <figure className="not-prose my-5 rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto p-3">
        {svg && <div ref={holder} className="mermaid-svg flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
        {!svg && !error && <div className="p-6 text-center text-sm text-ink-3">Rendering diagram…</div>}
        {error && (
          <div className="rounded-md bg-warn-soft p-3 text-sm text-warn">
            <strong>This diagram could not be rendered.</strong> The source is shown below so you can still read it.
            <div className="mt-1 font-mono text-xs opacity-80">{error.split('\n')[0]}</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">{caption ?? KIND_LABEL[kind]}</span>
        <span className="flex-1" />
        {messages > 1 && (seq === null ? (
          <button className="flex items-center gap-1 text-xs font-medium text-accent hover:underline" onClick={() => { setSeq(1); setPlaying(false); }}>
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor"><path d="M5 4l14 8-14 8z" /></svg>Step through {messages} messages
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs">
            <button className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-surface-2 disabled:opacity-40" disabled={seq <= 1} onClick={() => { setPlaying(false); setSeq(s => Math.max(1, (s ?? 1) - 1)); }} aria-label="Previous message">‹</button>
            <span className="font-mono tabular-nums text-ink-2">{seq}/{messages}</span>
            <button className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-surface-2 disabled:opacity-40" disabled={seq >= messages} onClick={() => { setPlaying(false); setSeq(s => Math.min(messages, (s ?? 0) + 1)); }} aria-label="Next message">›</button>
            <button className="rounded px-1.5 py-0.5 font-medium text-accent hover:bg-surface-2" onClick={() => { if (seq >= messages) setSeq(1); setPlaying(p => !p); }}>{playing ? 'Pause' : seq >= messages ? 'Replay' : 'Play'}</button>
            <button className="rounded px-1.5 py-0.5 text-ink-3 hover:bg-surface-2" onClick={() => { setPlaying(false); setSeq(null); }}>Show all</button>
          </span>
        ))}
        {svg && <button className="text-xs text-ink-2 hover:text-ink" onClick={() => setExpanded(true)}>Expand</button>}
        <button className="text-xs text-accent hover:underline" onClick={() => setShowSource(s => !s)} aria-expanded={showSource || !!error}>
          {showSource || error ? 'Hide source' : 'View source'}
        </button>
      </div>
      {(showSource || error) && <pre className="overflow-x-auto border-t border-line bg-surface-2 p-3 text-xs text-ink-2"><code>{source}</code></pre>}
      {expanded && svg && <ZoomDialog svg={svg} title={caption ?? KIND_LABEL[kind]} onClose={() => setExpanded(false)} />}
    </figure>
  );
}

type DiagramKind = 'sequence' | 'flowchart' | 'class' | 'state' | 'er' | 'other';
const KIND_LABEL: Record<DiagramKind, string> = { sequence: 'Sequence diagram', flowchart: 'Flowchart', class: 'Class diagram', state: 'State diagram', er: 'ER diagram', other: 'Diagram' };
function diagramKind(source: string): DiagramKind {
  const first = source.trim().split(/\s+/)[0] ?? '';
  if (first.startsWith('sequenceDiagram')) return 'sequence';
  if (first === 'flowchart' || first === 'graph') return 'flowchart';
  if (first.startsWith('classDiagram')) return 'class';
  if (first.startsWith('stateDiagram')) return 'state';
  if (first.startsWith('erDiagram')) return 'er';
  return 'other';
}

/** Message arrows and their labels, in diagram order. Null if the two lists don't pair up (unknown Mermaid output). */
function sequenceMessages(root: HTMLElement): Element[][] | null {
  const lines = Array.from(root.querySelectorAll('.messageLine0, .messageLine1'));
  const texts = Array.from(root.querySelectorAll('.messageText'));
  if (lines.length < 2 || lines.length !== texts.length) return null;
  return lines.map((l, i) => [l, texts[i]]);
}

/** One-off "drawing" animation: edges trace in, shapes fade up. Uses the Web Animations API so the original styles return afterwards. */
function drawIn(root: HTMLElement) {
  const svgEl = root.querySelector('svg');
  if (!svgEl || typeof (svgEl as SVGElement & { animate?: unknown }).animate !== 'function') return;
  const shapes = root.querySelectorAll('.node, .actor, .classGroup, g.statediagram-state, .entityBox, .er.entityBox, .note');
  shapes.forEach((s, i) => (s as SVGElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: Math.min(i * 40, 600), easing: 'ease-out', fill: 'backwards' }));
  const strokes = root.querySelectorAll('path.flowchart-link, .edgePaths path, .messageLine0, .messageLine1, path.relation, .transition, path.er.relationshipLine');
  strokes.forEach((p, i) => {
    const el = p as SVGGeometryElement;
    const len = typeof el.getTotalLength === 'function' ? el.getTotalLength() : 0;
    if (!len) return;
    el.animate([{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }],
      { duration: 650, delay: 200 + Math.min(i * 60, 900), easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'backwards' });
  });
}

function ZoomDialog({ svg, title, onClose }: { svg: string; title: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1.25);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="flex-1" />
        <button className="rounded-md border border-line px-2 py-0.5 text-sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
        <span className="w-12 text-center font-mono text-xs tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
        <button className="rounded-md border border-line px-2 py-0.5 text-sm" onClick={() => setZoom(z => Math.min(4, z + 0.25))} aria-label="Zoom in">+</button>
        <button className="ml-2 rounded-md bg-surface-2 px-3 py-1 text-sm font-medium text-ink" onClick={onClose}>Close</button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mermaid-zoom mx-auto origin-top" style={{ width: `${zoom * 100}%` }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
