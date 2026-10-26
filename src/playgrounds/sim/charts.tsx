import { useId, useState, type MouseEvent } from 'react';

// Tiny inline-SVG charts. Colours come from CSS variables so light/dark themes switch automatically.

export const C = {
  accent: 'var(--color-accent)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
  ok: 'var(--color-ok)',
  muted: 'var(--color-ink-3)',
  ink: 'var(--color-ink)',
  ink2: 'var(--color-ink-2)',
  line: 'var(--color-line)',
  surface: 'var(--color-surface)',
  soft: 'var(--color-surface-2)',
  warnSoft: 'var(--color-warn-soft)',
  badSoft: 'var(--color-bad-soft)',
};

export interface Series {
  label: string;
  values: number[];
  color: string;
  dashed?: boolean;
  area?: boolean;
}

export interface Band {
  from: number;
  to: number;
  label: string;
}

const W = 600;
const PAD = { l: 44, r: 10, t: 8, b: 20 };

function niceMax(v: number): number {
  if (v <= 0 || !Number.isFinite(v)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function LineChart(props: {
  title: string;
  series: Series[];
  /** Number of points to reveal (playback position). */
  t: number;
  height?: number;
  yMax?: number;
  yFormat?: (v: number) => string;
  xFormat?: (i: number) => string;
  bands?: Band[];
  refLine?: { y: number; label: string };
}) {
  const H = props.height ?? 150;
  const n = Math.max(1, ...props.series.map((s) => s.values.length));
  const shown = Math.max(0, Math.min(n, props.t));
  const fmt = props.yFormat ?? ((v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 100) / 100)));
  const xf = props.xFormat ?? ((i: number) => `${i}s`);
  const finite = props.series.flatMap((s) => s.values.filter(Number.isFinite));
  const yMax = props.yMax ?? niceMax(Math.max(props.refLine?.y ?? 0, ...finite, 0) * 1.05);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (Math.min(Math.max(v, 0), yMax) / yMax) * ih;
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  const pathFor = (vals: number[]) => {
    let d = '';
    for (let i = 0; i < Math.min(shown, vals.length); i++) d += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number.isFinite(vals[i]) ? vals[i] : yMax).toFixed(1)}`;
    return d;
  };

  const last = shown - 1;
  const summary =
    last >= 0 ? props.series.map((s) => `${s.label} ${fmt(s.values[Math.min(last, s.values.length - 1)] ?? 0)}`).join(', ') : 'no data yet';

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / iw) * (n - 1));
    setHover(i >= 0 && i < shown ? i : null);
  };

  return (
    <figure className="m-0 rounded-lg border border-line bg-surface p-2">
      <figcaption id={titleId} className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px]">
        <span className="font-medium text-ink">{props.title}</span>
        {props.series.length > 1 &&
          props.series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1 text-ink-2">
              <svg width="14" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="14" y2="3" style={{ stroke: s.color, strokeWidth: 2, strokeDasharray: s.dashed ? '3 2' : undefined }} />
              </svg>
              {s.label}
            </span>
          ))}
        {props.bands?.map((b) => (
          <span key={b.label} className="inline-flex items-center gap-1 text-ink-2">
            <span className="inline-block h-2 w-3 rounded-sm bg-warn-soft" aria-hidden="true" />
            {b.label}
          </span>
        ))}
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-labelledby={titleId}
          aria-describedby={`${titleId}-d`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <desc id={`${titleId}-d`}>{`Latest values: ${summary}`}</desc>
          {props.bands?.map((b) => (
            <rect key={b.label + b.from} x={x(b.from)} y={PAD.t} width={Math.max(0, x(Math.min(b.to, n - 1)) - x(b.from))} height={ih} style={{ fill: C.warnSoft }} />
          ))}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(yMax * f)} y2={y(yMax * f)} style={{ stroke: C.line, strokeWidth: 1 }} />
              <text x={PAD.l - 6} y={y(yMax * f) + 3} textAnchor="end" style={{ fill: C.muted, fontSize: 10 }}>
                {fmt(yMax * f)}
              </text>
            </g>
          ))}
          {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} style={{ fill: C.muted, fontSize: 10 }}>
              {xf(i)}
            </text>
          ))}
          {props.refLine && (
            <g>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(props.refLine.y)} y2={y(props.refLine.y)} style={{ stroke: C.ink2, strokeWidth: 1, strokeDasharray: '4 3' }} />
              <text x={W - PAD.r - 2} y={y(props.refLine.y) - 3} textAnchor="end" style={{ fill: C.ink2, fontSize: 10 }}>
                {props.refLine.label}
              </text>
            </g>
          )}
          {props.series.map((s) => (
            <g key={s.label}>
              {s.area && shown > 1 && (
                <path d={`${pathFor(s.values)}L${x(Math.min(shown, s.values.length) - 1)},${y(0)}L${x(0)},${y(0)}Z`} style={{ fill: s.color, opacity: 0.12 }} />
              )}
              <path d={pathFor(s.values)} style={{ fill: 'none', stroke: s.color, strokeWidth: 2, strokeLinejoin: 'round', strokeDasharray: s.dashed ? '5 3' : undefined }} />
            </g>
          ))}
          {shown > 0 && shown < n && <line x1={x(last)} x2={x(last)} y1={PAD.t} y2={PAD.t + ih} style={{ stroke: C.muted, strokeWidth: 1 }} />}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} style={{ stroke: C.ink2, strokeWidth: 1 }} />
              {props.series.map((s) =>
                Number.isFinite(s.values[hover]) ? (
                  <circle key={s.label} cx={x(hover)} cy={y(s.values[hover])} r={4} style={{ fill: s.color, stroke: C.surface, strokeWidth: 2 }} />
                ) : null,
              )}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-sm"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}
          >
            <div className="font-medium text-ink">{xf(hover)}</div>
            {props.series.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-ink-2">
                <span className="inline-block h-0.5 w-2.5" style={{ background: s.color }} aria-hidden="true" />
                {s.label}: <span className="tabular-nums text-ink">{fmt(s.values[hover] ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

/** One coloured cell per time step — for discrete states such as circuit breaker closed/open/half-open. */
export function StateStrip<S extends string>(props: { title: string; states: S[]; t: number; colors: Record<S, string>; labels: Record<S, string> }) {
  const n = Math.max(1, props.states.length);
  const iw = W - PAD.l - PAD.r;
  const cw = iw / n;
  const [hover, setHover] = useState<number | null>(null);
  const counts = (Object.keys(props.labels) as S[]).map((k) => [k, props.states.slice(0, props.t).filter((s) => s === k).length] as const);
  return (
    <figure className="m-0 rounded-lg border border-line bg-surface p-2">
      <figcaption className="mb-1 flex flex-wrap items-center gap-x-3 px-1 text-[11px]">
        <span className="font-medium text-ink">{props.title}</span>
        {counts.map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1 text-ink-2">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: props.colors[k] }} aria-hidden="true" />
            {props.labels[k]} ({c}s)
          </span>
        ))}
        {hover !== null && <span className="ml-auto text-ink">t={hover}s: {props.labels[props.states[hover]]}</span>}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} 26`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${props.title}: ${counts.map(([k, c]) => `${props.labels[k]} ${c} seconds`).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {props.states.slice(0, props.t).map((s, i) => (
          <rect key={i} x={PAD.l + i * cw} y={2} width={Math.max(0.5, cw - 0.5)} height={18} style={{ fill: props.colors[s] }} onMouseEnter={() => setHover(i)} />
        ))}
        <rect x={PAD.l} y={2} width={iw} height={18} rx={3} style={{ fill: 'none', stroke: C.line }} />
      </svg>
    </figure>
  );
}

/** Horizontal bars with labels and values, one per item. */
export function BarChart(props: { title: string; bars: { label: string; value: number; color?: string; note?: string }[]; max?: number; format?: (v: number) => string; refValue?: { value: number; label: string } }) {
  const fmt = props.format ?? ((v: number) => String(Math.round(v)));
  const max = props.max ?? niceMax(Math.max(props.refValue?.value ?? 0, ...props.bars.map((b) => b.value), 0));
  const rowH = 22;
  const H = props.bars.length * rowH + 6;
  const labelW = 120;
  const valueW = 70;
  const iw = W - labelW - valueW;
  return (
    <figure className="m-0 rounded-lg border border-line bg-surface p-2">
      <figcaption className="mb-1 px-1 text-[11px] font-medium text-ink">{props.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${props.title}: ${props.bars.map((b) => `${b.label} ${fmt(b.value)}`).join(', ')}`}>
        {props.bars.map((b, i) => {
          const w = Math.max(0, Math.min(1, b.value / max)) * iw;
          const yy = i * rowH + 3;
          return (
            <g key={b.label + i}>
              <title>{`${b.label}: ${fmt(b.value)}${b.note ? ` (${b.note})` : ''}`}</title>
              <text x={labelW - 8} y={yy + 13} textAnchor="end" style={{ fill: C.ink2, fontSize: 11 }}>
                {b.label}
              </text>
              <rect x={labelW} y={yy + 2} width={iw} height={rowH - 8} rx={3} style={{ fill: C.soft }} />
              <rect x={labelW} y={yy + 2} width={w} height={rowH - 8} rx={3} style={{ fill: b.color ?? C.accent }} />
              <text x={labelW + iw + 6} y={yy + 13} style={{ fill: C.ink, fontSize: 11 }}>
                {fmt(b.value)}
              </text>
            </g>
          );
        })}
        {props.refValue && (
          <g>
            <line x1={labelW + (props.refValue.value / max) * iw} x2={labelW + (props.refValue.value / max) * iw} y1={0} y2={H} style={{ stroke: C.ink2, strokeDasharray: '3 3' }} />
          </g>
        )}
      </svg>
      {props.refValue && <p className="px-1 text-[11px] text-ink-3">Dashed line: {props.refValue.label}</p>}
    </figure>
  );
}
