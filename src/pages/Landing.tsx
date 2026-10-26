import { Link } from 'react-router-dom';
import { contentStats, modules, TRACK_COLOR, TRACK_LABEL, type Track } from '../lib/content';
import { useProgress } from '../lib/progress';
import { ButtonLink, Icon, type IconName } from '../components/ui';

const LOOP: [IconName, string, string][] = [
  ['bulb', 'Understand', 'Plain-English first'],
  ['eye', 'Visualize', 'Live diagrams'],
  ['code', 'Implement', 'Real C# code'],
  ['test', 'Test', 'xUnit & SQL checks'],
  ['bolt', 'Break', 'Failure simulators'],
  ['scale', 'Improve', 'Bad → good design'],
  ['trophy', 'Design', 'Interviews & capstones'],
];

const FEATURES: [IconName, string, string, string][] = [
  ['focus', 'Study mode', 'One step at a time, bite-sized concept cards.', '/curriculum'],
  ['flask', '10+ playgrounds', 'SQL, C#, HLD canvas, class designer, simulators.', '/playground'],
  ['cards', 'Spaced repetition', 'Flashcards that come back right before you forget.', '/flashcards'],
  ['exam', 'Mock exams', 'Timed exams and interview practice.', '/assessments'],
];

const TRACK_ICON: Record<Track, IconName> = { foundations: 'layers', lld: 'code', hld: 'globe', ops: 'bolt', career: 'trophy' };

export default function Landing() {
  const s = contentStats();
  const progress = useProgress();
  const started = Object.keys(progress.visits).length > 0;
  const tracks = (Object.keys(TRACK_LABEL) as Track[]).map(t => {
    const ms = modules.filter(m => m.track === t);
    return { t, modules: ms.length, lessons: ms.reduce((n, m) => n + m.lessons.length, 0), first: ms[0] };
  }).filter(x => x.modules);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* ---------- hero ---------- */}
      <section className="bg-hero relative overflow-hidden rounded-3xl border border-line px-6 py-10 shadow-[var(--shadow-card)] sm:px-10 sm:py-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-surface/70 px-3 py-1 text-xs font-medium text-accent">
              <Icon name="sparkle" className="h-3.5 w-3.5" /> Version 2.0 · Interactive study mode
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Learn system design.<br /><span className="text-brand">From zero to architect.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-2">Bite-sized lessons, live diagrams, playgrounds and quizzes — with C#, ASP.NET Core and PostgreSQL.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink size="lg" to={started ? '/dashboard' : '/lesson/m01-software-engineering'} variant="primary">
                {started ? 'Continue learning' : 'Start learning — free'}<Icon name="arrowRight" className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink size="lg" to="/curriculum">Explore the map</ButtonLink>
            </div>
            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {([['Modules', s.modules], ['Lessons', s.written], ['Exercises', s.exercises]] as const).map(([k, v]) => (
                <div key={k}><dd className="text-2xl font-bold tabular-nums text-ink">{v}</dd><dt className="text-xs text-ink-3">{k}</dt></div>
              ))}
            </dl>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* ---------- learning loop ---------- */}
      <section className="mt-12">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-ink-3">Every lesson, one loop</h2>
        <ol className="stagger mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {LOOP.map(([icon, t, d], i) => (
            <li key={t} className="lift relative rounded-2xl border border-line bg-surface p-4 text-center">
              <span className="absolute right-2 top-2 text-[10px] font-bold text-ink-3">{i + 1}</span>
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Icon name={icon} className="h-5 w-5" /></span>
              <div className="mt-2 text-sm font-semibold text-ink">{t}</div>
              <div className="text-xs text-ink-3">{d}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- tracks ---------- */}
      <section className="mt-12">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-ink">Choose your track</h2>
          <Link to="/curriculum" className="text-sm font-medium text-accent">Full curriculum →</Link>
        </div>
        <div className="stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tracks.map(({ t, modules: n, lessons, first }) => (
            <Link key={t} to={first ? `/curriculum?m=${first.id}` : '/curriculum'} className="lift group relative overflow-hidden rounded-2xl border border-line bg-surface p-4">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: TRACK_COLOR[t] }} />
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${TRACK_COLOR[t]} 15%, transparent)`, color: TRACK_COLOR[t] }}><Icon name={TRACK_ICON[t]} className="h-5 w-5" /></span>
              <div className="mt-3 font-semibold text-ink">{TRACK_LABEL[t]}</div>
              <div className="text-xs text-ink-3">{n} modules · {lessons} lessons</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([icon, t, d, to]) => (
          <Link key={t} to={to} className="lift flex gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="bg-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"><Icon name={icon} className="h-5 w-5" /></span>
            <span><span className="block font-semibold text-ink">{t}</span><span className="block text-sm text-ink-2">{d}</span></span>
          </Link>
        ))}
      </section>

      {/* ---------- modules ---------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight text-ink">20 modules, one path</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map(m => {
            const done = m.lessons.filter(l => progress.completed[l.id]).length;
            const color = TRACK_COLOR[m.track];
            return (
              <li key={m.id}>
                <Link to={`/curriculum?m=${m.id}`} className="lift flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{m.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{m.title}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${(done / Math.max(1, m.lessons.length)) * 100}%`, background: color }} /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-center text-xs text-ink-3">Runs entirely in your browser — progress stays on this device (export a backup in Settings). C# exercises download as .NET projects you run with <code className="rounded bg-surface-2 px-1 font-mono">dotnet test</code>.</p>
      </section>
    </div>
  );
}

/** Decorative mock of a Study-mode step, so the hero shows what the product feels like. */
function HeroPreview() {
  return (
    <div className="relative hidden lg:block" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-brand opacity-20 blur-3xl" />
      <div className="relative rotate-1 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-lift)] animate-pop">
        <div className="flex gap-1.5">
          {['target', 'bulb', 'eye', 'code', 'exam'].map((i, n) => (
            <span key={i} className={n === 2 ? 'bg-brand flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white' : n < 2 ? 'flex h-7 w-7 items-center justify-center rounded-full bg-ok-soft text-ok' : 'flex h-7 w-7 items-center justify-center rounded-full border border-line text-ink-3'}>
              <Icon name={n < 2 ? 'check' : (i as IconName)} className="h-3.5 w-3.5" />{n === 2 && 'Visual'}
            </span>
          ))}
        </div>
        <div className="mt-2 h-1 rounded-full bg-surface-2"><div className="bg-brand h-full w-3/5 rounded-full" /></div>
        <div className="mt-4 text-xs text-ink-3">Step 3 of 5</div>
        <div className="text-lg font-bold text-ink">How a cache fits in</div>
        <svg viewBox="0 0 300 92" className="mt-3 w-full">
          {[['Client', 10], ['API', 112], ['Cache', 214]].map(([t, x]) => (
            <g key={t as string}><rect x={x as number} y="10" width="76" height="32" rx="8" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeOpacity=".4" /><text x={(x as number) + 38} y="31" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-accent)">{t}</text></g>
          ))}
          <rect x="112" y="56" width="76" height="30" rx="8" fill="var(--color-surface-2)" stroke="var(--color-line)" /><text x="150" y="76" textAnchor="middle" fontSize="12" fill="var(--color-ink-2)">Postgres</text>
          <path d="M86 26h24M188 26h24M150 42v12" stroke="var(--color-ink-3)" strokeWidth="1.5" markerEnd="url(#ah)" fill="none" />
          <defs><marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0l6 3-6 3z" fill="var(--color-ink-3)" /></marker></defs>
        </svg>
        <div className="mt-3 space-y-2">
          {[['1', 'What it is', true], ['2', 'Why it exists', false]].map(([n, t, open]) => (
            <div key={n as string} className={open ? 'rounded-xl border border-accent/40 p-2.5' : 'rounded-xl border border-line p-2.5'}>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><span className={open ? 'flex h-5 w-5 items-center justify-center rounded-full bg-ok text-[10px] text-white' : 'flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[10px] text-ink-2'}>{open ? '✓' : n}</span>{t}</div>
              {open && <div className="mt-2 space-y-1.5"><div className="h-2 w-11/12 rounded bg-surface-2" /><div className="h-2 w-4/5 rounded bg-surface-2" /></div>}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-5 -left-6 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 shadow-[var(--shadow-lift)] animate-pop [animation-delay:200ms]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-flame)_15%,transparent)] text-flame"><Icon name="flame" className="h-4 w-4" /></span>
        <span className="text-sm"><span className="font-bold text-ink">Build a daily streak</span><span className="block text-xs text-ink-3">Earn XP as you learn</span></span>
      </div>
    </div>
  );
}
