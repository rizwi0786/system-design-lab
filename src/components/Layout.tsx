import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { modules, allLessons, TRACK_COLOR } from '../lib/content';
import { useProgress } from '../lib/progress';
import { useSettings, updateSettings, isDark } from '../lib/settings';
import { levelFor, streak, totalXp } from '../lib/gamify';
import { Icon, StatusDot, cx, type IconName } from './ui';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/curriculum', label: 'Curriculum', icon: 'map' },
  { to: '/patterns', label: 'Pattern Atlas', icon: 'atlas' },
  { to: '/practice', label: 'Practice', icon: 'target' },
  { to: '/playground', label: 'Playgrounds', icon: 'flask' },
  { to: '/assessments', label: 'Assessments', icon: 'exam' },
  { to: '/flashcards', label: 'Flashcards', icon: 'cards' },
  { to: '/projects', label: 'Projects', icon: 'build' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
];

function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight text-ink">
      <svg viewBox="0 0 32 32" className="h-8 w-8 drop-shadow-sm" aria-hidden>
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--color-accent)" /><stop offset="1" stopColor="var(--color-accent-2)" /></linearGradient></defs>
        <rect width="32" height="32" rx="9" fill="url(#lg)" /><rect x="6" y="7" width="8" height="6" rx="1.5" fill="#fff" /><rect x="18" y="7" width="8" height="6" rx="1.5" fill="#fff" opacity=".85" /><rect x="12" y="19" width="8" height="6" rx="1.5" fill="#fff" /><path d="M10 13v3h12v-3M16 16v3" stroke="#fff" strokeWidth="1.6" fill="none" />
      </svg>
      <span className="hidden sm:inline">System Design <span className="text-brand">Lab</span></span>
    </Link>
  );
}

function ThemeToggle() {
  const s = useSettings();
  const dark = isDark(s.theme);
  return (
    <button onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })} className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Toggle theme">
      {dark
        ? <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
    </button>
  );
}

/** Streak + level chips. Both are derived from progress, see lib/gamify.ts. */
function Momentum() {
  const p = useProgress();
  const s = streak(p);
  const xp = totalXp(p);
  const lv = levelFor(xp);
  return (
    <Link to="/dashboard" className="flex items-center gap-1.5" title={`${xp} XP · level ${lv.level} · ${s.days}-day streak`}>
      <span className={cx('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums', s.activeToday ? 'bg-[color-mix(in_srgb,var(--color-flame)_15%,transparent)] text-flame' : 'bg-surface-2 text-ink-3')}>
        <Icon name="flame" className="h-3.5 w-3.5" />{s.days}
      </span>
      <span className="hidden items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1 pr-2.5 text-xs font-semibold text-accent sm:flex">
        <span className="bg-brand flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white">{lv.level}</span>
        <span className="tabular-nums">{xp} XP</span>
      </span>
    </Link>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const progress = useProgress();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const done = Object.keys(progress.completed).length;
  const written = allLessons.filter(l => l.hasContent).length;
  const pct = written ? Math.round((done / written) * 100) : 0;
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); };
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <Logo />
      <form onSubmit={submit} className="relative ml-2 min-w-0 flex-1 sm:max-w-md" role="search">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={e => setQ(e.target.value)} type="search" placeholder="Search lessons, patterns…" aria-label="Search"
          className="w-full rounded-full border border-line bg-surface-2 py-1.5 pl-9 pr-3 text-sm text-ink transition-colors placeholder:text-ink-3 focus:border-accent/50 focus:bg-surface" />
      </form>
      <Link to="/analytics" className="hidden items-center gap-2 text-xs text-ink-2 xl:flex" title={`${done} of ${written} written lessons completed (${allLessons.length} planned in total)`}>
        <span className="tabular-nums">{done}/{written}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2"><span className="bg-brand block h-full" style={{ width: `${pct}%` }} /></span>
      </Link>
      <Momentum />
      <ThemeToggle />
      <Link to="/settings" className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink" aria-label="Settings" title="Settings">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      </Link>
    </header>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const progress = useProgress();
  const { pathname } = useLocation();
  const currentLesson = pathname.startsWith('/lesson/') ? pathname.split('/')[2] : null;
  const currentModule = currentLesson ? allLessons.find(l => l.id === currentLesson)?.module : null;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { if (currentModule) setOpen(o => ({ ...o, [currentModule]: true })); }, [currentModule]);
  useEffect(() => {
    if (currentLesson) document.getElementById(`nav-${currentLesson}`)?.scrollIntoView({ block: 'nearest' });
  }, [currentLesson]);

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-3 py-4 text-sm" aria-label="Main">
      <ul className="mb-5 space-y-0.5">
        {NAV.map(n => (
          <li key={n.to}>
            <NavLink to={n.to} onClick={onNavigate} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors', isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              <Icon name={n.icon} className="h-[18px] w-[18px]" />{n.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Modules</div>
      <ul className="space-y-0.5">
        {modules.map(m => {
          const isOpen = !!open[m.id];
          const written = m.lessons.filter(l => l.hasContent).length;
          const done = m.lessons.filter(l => progress.completed[l.id]).length;
          const color = TRACK_COLOR[m.track];
          return (
            <li key={m.id}>
              <button onClick={() => setOpen(o => ({ ...o, [m.id]: !isOpen }))} aria-expanded={isOpen}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2', currentModule === m.id ? 'text-ink' : 'text-ink-2')}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{m.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{m.title}</span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2" title={`${done} completed · ${written} of ${m.lessons.length} written`}>
                    <span className="block h-full rounded-full" style={{ width: `${(done / Math.max(1, m.lessons.length)) * 100}%`, background: color }} />
                  </span>
                </span>
                <Icon name="chevron" className={cx('h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform', isOpen && 'rotate-90')} />
              </button>
              {isOpen && (
                <ul className="mb-1 ml-5 mt-0.5 space-y-px border-l-2 pl-2" style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}>
                  {m.lessons.map(l => (
                    <li key={l.id}>
                      <NavLink id={`nav-${l.id}`} to={`/lesson/${l.id}`} onClick={onNavigate}
                        className={({ isActive }) => cx('flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors', isActive ? 'bg-accent-soft font-medium text-accent' : l.hasContent ? 'text-ink-2 hover:bg-surface-2 hover:text-ink' : 'text-ink-3 hover:bg-surface-2')}>
                        <StatusDot status={l.status} complete={!!progress.completed[l.id]} />
                        <span className="min-w-0 flex-1 truncate" title={l.title}>{l.title}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-2.5 pt-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5"><StatusDot status="reviewed" /> Written</span>
        <span className="flex items-center gap-1.5"><StatusDot status="draft" /> Draft</span>
        <span className="flex items-center gap-1.5"><StatusDot status="planned" /> Planned</span>
        <span className="flex items-center gap-1.5"><StatusDot status="reviewed" complete /> Done</span>
        <Link to="/about" onClick={onNavigate} className="basis-full pt-1 text-accent">About & limitations</Link>
      </div>
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);
  return (
    <div className="min-h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      <Header onMenu={() => setDrawer(true)} />
      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-72 shrink-0 border-r border-line bg-surface lg:block"><Sidebar /></aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r border-line bg-surface shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-line px-4"><Logo /><button onClick={() => setDrawer(false)} className="rounded p-2 text-ink-2 hover:bg-surface-2" aria-label="Close navigation">✕</button></div>
              <div className="h-[calc(100%-3.5rem)]"><Sidebar onNavigate={() => setDrawer(false)} /></div>
            </aside>
          </div>
        )}
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
