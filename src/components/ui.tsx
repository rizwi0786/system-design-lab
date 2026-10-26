import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-sm hover:brightness-110 hover:shadow-[var(--shadow-lift)]',
  secondary: 'border border-line bg-surface text-ink hover:border-accent/40 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90 dark:text-bg',
};

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-[15px]' : 'px-3.5 py-2 text-sm',
        VARIANT[variant],
        className,
      )}
    />
  );
}

export function ButtonLink({ to, children, variant = 'secondary', size = 'md', className }: { to: string; children: ReactNode; variant?: Variant; size?: 'md' | 'lg'; className?: string }) {
  return (
    <Link to={to} className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all active:scale-[0.97]',
      size === 'lg' ? 'px-5 py-2.5 text-[15px]' : 'px-3.5 py-2 text-sm',
      VARIANT[variant], className)}>{children}</Link>
  );
}

export function Card({ children, className, title, action, icon }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; icon?: IconName }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">{icon && <Icon name={icon} className="h-4 w-4 text-accent" />}{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad';
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
      tone === 'neutral' && 'bg-surface-2 text-ink-2',
      tone === 'accent' && 'bg-accent-soft text-accent',
      tone === 'ok' && 'bg-ok-soft text-ok',
      tone === 'warn' && 'bg-warn-soft text-warn',
      tone === 'bad' && 'bg-bad-soft text-bad', className)}>{children}</span>
  );
}

export const LEVEL_TONE: Record<string, Tone> = { beginner: 'ok', intermediate: 'accent', advanced: 'warn' };
export function LevelBadge({ level }: { level: string }) { return <Badge tone={LEVEL_TONE[level] ?? 'neutral'}>{level}</Badge>; }

export const STATUS_LABEL: Record<string, string> = { planned: 'Planned', draft: 'Draft', reviewed: 'Reviewed', tested: 'Tested', published: 'Published' };
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status === 'planned' ? 'neutral' : status === 'draft' ? 'warn' : 'ok';
  return <Badge tone={tone}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function StatusDot({ status, complete }: { status: string; complete?: boolean }) {
  if (complete) return <span aria-label="completed" title="Completed" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok text-[9px] text-white dark:text-bg">✓</span>;
  const c = status === 'planned' ? 'border border-ink-3 bg-transparent' : status === 'draft' ? 'bg-warn' : 'bg-accent';
  return <span aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} className={cx('inline-block h-2 w-2 shrink-0 rounded-full', c)} />;
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="bg-brand h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Circular progress with an optional centre label. */
export function ProgressRing({ value, size = 64, stroke = 7, children, color = 'var(--color-accent)', label }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center">{children ?? <span className="text-xs font-semibold tabular-nums text-ink">{Math.round(v)}%</span>}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-5 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, children, actions, icon }: { title: string; children?: ReactNode; actions?: ReactNode; icon?: IconName }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="bg-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"><Icon name={icon} className="h-5 w-5" /></span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {children && <div className="mt-0.5 max-w-3xl text-sm text-ink-2">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cx('inline-flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1', className)}>
      {tabs.map(t => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('rounded-lg px-3 py-1.5 text-sm transition-all', value === t.id ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-xs text-ink-2', className)}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value as T)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

/** Compact KPI tile: coloured icon + big number + label. */
export function StatTile({ icon, label, value, hint, color = 'var(--color-accent)', className }: { icon: IconName; label: string; value: ReactNode; hint?: ReactNode; color?: string; className?: string }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]', className)}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight tabular-nums text-ink">{value}</div>
        <div className="truncate text-xs text-ink-3">{label}{hint ? <> · {hint}</> : null}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex items-center gap-2 p-4 text-sm text-ink-3" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />{label}</div>;
}

// ---------------- icons (inline, stroke-based, inherit currentColor) ----------------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  atlas: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  play: 'M5 4l14 8-14 8z',
  flask: 'M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 14h10',
  exam: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 13l2 2 4-4',
  cards: 'M4 7h12v13H4zM8 3h12v13',
  build: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  flame: 'M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6.2-4-8-.4 2-1.5 3.3-3 4 .5-3.3-1-6.5-4-9 0 4-5 6.5-5 13 0 4.3 4 7 9 7z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 0 4 21.5zM20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5a1.5 1.5 0 0 1 1.5 1.5z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  steps: 'M4 20h4v-4h4v-4h4V8h4',
  scale: 'M12 3v18M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM8 21h8',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  test: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  focus: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 3v4M17 5h4',
  note: 'M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  maximize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  minimize: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M3 21 14 10',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  minimap: 'M3 5h18v14H3zM13 12h6v5h-6',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9z',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
