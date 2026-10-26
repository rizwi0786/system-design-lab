import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

// ---------- params from attrs ----------

type Primitive = number | boolean | string;

/**
 * Overlays lesson attrs (always strings, e.g. hitRatio="0.8") onto typed defaults.
 * Unknown keys and values that do not parse are ignored; string values must be in `allowed` when given.
 */
export function applyAttrs<T extends { [K in keyof T]: Primitive }>(
  defaults: T,
  attrs?: Record<string, string>,
  allowed?: Partial<Record<keyof T, readonly string[]>>,
): T {
  const out: Record<string, Primitive> = { ...defaults };
  if (!attrs) return out as T;
  for (const [k, raw] of Object.entries(attrs)) {
    if (!(k in defaults)) continue;
    const d = (defaults as Record<string, Primitive>)[k];
    if (typeof d === 'number') {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n)) out[k] = n;
    } else if (typeof d === 'boolean') {
      if (/^(true|1|yes|on)$/i.test(raw)) out[k] = true;
      else if (/^(false|0|no|off)$/i.test(raw)) out[k] = false;
    } else {
      const ok = allowed?.[k as keyof T];
      if (!ok || ok.includes(raw)) out[k] = raw;
    }
  }
  return out as T;
}

export function useSimParams<T extends { [K in keyof T]: Primitive }>(
  defaults: T,
  attrs?: Record<string, string>,
  allowed?: Partial<Record<keyof T, readonly string[]>>,
) {
  const [initial] = useState(() => applyAttrs(defaults, attrs, allowed));
  const [params, setParams] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setParams((p) => ({ ...p, [key]: value })), []);
  const patch = useCallback((p: Partial<T>) => setParams((prev) => ({ ...prev, ...p })), []);
  const restore = useCallback(() => setParams(initial), [initial]);
  return { params, set, patch, restore };
}

// ---------- playback ----------

export interface Playback {
  t: number;
  total: number;
  playing: boolean;
  toggle: () => void;
  step: () => void;
  reset: () => void;
  seek: (t: number) => void;
}

/**
 * Reveals a precomputed run step by step. Starts showing the whole run; Play from the end restarts.
 * A full run takes about 6 seconds whatever its length.
 */
export function usePlayback(total: number): Playback {
  const [t, setT] = useState(total);
  const [playing, setPlaying] = useState(false);
  const stepSize = Math.max(1, Math.round(total / 80));
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  // When the run length changes: stay at the end if we were at the end, otherwise clamp.
  const prevTotal = useRef(total);
  useEffect(() => {
    const prev = prevTotal.current;
    prevTotal.current = total;
    setT((x) => (x >= prev ? total : Math.min(x, total)));
  }, [total]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const next = Math.min(totalRef.current, x + stepSize);
        if (next >= totalRef.current) setPlaying(false);
        return next;
      });
    }, 75);
    return () => clearInterval(id);
  }, [playing, stepSize]);

  return {
    t,
    total,
    playing,
    toggle: () => {
      if (playing) setPlaying(false);
      else {
        if (t >= total) setT(0);
        setPlaying(true);
      }
    },
    step: () => {
      setPlaying(false);
      setT((x) => (x >= total ? stepSize : Math.min(total, x + stepSize)));
    },
    reset: () => {
      setPlaying(false);
      setT(0);
    },
    seek: (x: number) => {
      setPlaying(false);
      setT(Math.max(0, Math.min(total, Math.round(x))));
    },
  };
}

// ---------- controls ----------

const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50';

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  const id = useId();
  const fmt = props.format ?? ((v: number) => String(v));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-ink-2" title={props.hint}>
          {props.label}
        </label>
        <output htmlFor={id} className="text-xs font-medium tabular-nums text-ink">
          {fmt(props.value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        aria-valuetext={fmt(props.value)}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-xs text-ink">
      <input id={id} type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
      <span>
        {props.label}
        {props.hint && <span className="block text-[11px] text-ink-3">{props.hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<V extends string>(props: { label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-ink-2">{props.label}</div>
      <div role="radiogroup" aria-label={props.label} className="inline-flex flex-wrap rounded-md border border-line p-0.5">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={props.value === o.value}
            onClick={() => props.onChange(o.value)}
            className={`rounded px-2.5 py-1 text-xs ${props.value === o.value ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone = 'neutral', sub }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad'; sub?: string }) {
  const cls = { neutral: 'text-ink', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[tone];
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function PlaybackBar({ pb, unit = 's', label = 'Time' }: { pb: Playback; unit?: string; label?: string }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Playback controls">
      <button type="button" className={btn} onClick={pb.toggle} aria-label={pb.playing ? 'Pause' : 'Play'}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ fill: 'currentColor' }}>
          {pb.playing ? <path d="M2 1h3v10H2zM7 1h3v10H7z" /> : <path d="M2 1l9 5l-9 5z" />}
        </svg>
        {pb.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" className={btn} onClick={pb.step}>
        Step
      </button>
      <button type="button" className={btn} onClick={pb.reset}>
        Reset
      </button>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={pb.total}
        value={pb.t}
        onChange={(e) => pb.seek(Number(e.target.value))}
        className="min-w-[120px] flex-1 accent-[var(--color-accent)]"
        aria-valuetext={`${pb.t} of ${pb.total} ${unit}`}
      />
      <span className="w-24 text-right text-[11px] tabular-nums text-ink-3" aria-live="off">
        {label.toLowerCase()} {pb.t}/{pb.total}
        {unit}
      </span>
    </div>
  );
}

export interface TryThis {
  text: string;
  /** Applies the suggested parameters. */
  apply?: () => void;
}

export function SimShell(props: {
  title: string;
  description: string;
  controls: ReactNode;
  playback?: ReactNode;
  stats: ReactNode;
  charts: ReactNode;
  assumptions: string[];
  tryThis: TryThis[];
  onRestore: () => void;
  compact?: boolean;
}) {
  return (
    <section aria-label={`${props.title} simulator`} className="rounded-xl border border-line bg-surface text-ink">
      <header className="flex flex-wrap items-start gap-2 border-b border-line px-4 py-3">
        <div className="mr-auto min-w-0">
          <h2 className="text-sm font-semibold">{props.title}</h2>
          <p className="text-xs text-ink-2">{props.description}</p>
        </div>
        <button type="button" className={btn} onClick={props.onRestore}>
          Restore defaults
        </button>
      </header>
      <div className={`grid gap-4 p-4 ${props.compact ? '' : 'lg:grid-cols-[260px_1fr]'}`}>
        <div className={`space-y-3 ${props.compact ? 'grid gap-3 sm:grid-cols-2 sm:space-y-0' : ''}`} aria-label="Parameters" role="group">
          {props.controls}
        </div>
        <div className="min-w-0 space-y-3">
          {props.playback}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{props.stats}</div>
          {props.charts}
        </div>
      </div>
      <div className={`grid gap-3 border-t border-line p-4 text-xs ${props.compact ? '' : 'md:grid-cols-2'}`}>
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Try this</h3>
          <ul className="space-y-1.5">
            {props.tryThis.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-accent" aria-hidden="true">
                  →
                </span>
                <span className="flex-1 leading-relaxed text-ink-2">{t.text}</span>
                {t.apply && (
                  <button type="button" className={`${btn} shrink-0`} onClick={t.apply}>
                    Set up
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Assumptions</h3>
          <p className="mb-1 text-ink-2">
            This is a simplified, deterministic teaching model (seeded random numbers, so the same settings always give
            the same run). Numbers are illustrative, not benchmarks.
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-ink-2">
            {props.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------- formatting ----------

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const ms = (x: number) => (!Number.isFinite(x) ? '∞' : x >= 10_000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
export const num = (x: number) => (Math.abs(x) >= 10_000 ? `${(x / 1000).toFixed(1)}k` : Math.round(x).toLocaleString());
