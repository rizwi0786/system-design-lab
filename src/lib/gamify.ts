// Motivation layer: XP, level, daily streak and daily goal.
// Everything is derived from the recorded progress state (nothing new is stored), so it can never drift
// from what the learner actually did and it survives backup/restore automatically.
import type { ProgressState } from './progress';

export const XP = { lessonOpened: 10, lessonCompleted: 100, exerciseDone: 30, quizAttempt: 10, quizPassed: 40, flashcardReview: 5, exam: 40, interview: 20 } as const;
export const DAILY_GOAL_XP = 100;

const ACTIVITY_XP: Partial<Record<string, number>> = {
  visit: XP.lessonOpened, complete: XP.lessonCompleted, quiz: XP.quizAttempt, exam: XP.exam, interview: XP.interview,
};

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function totalXp(p: ProgressState): number {
  let xp = Object.keys(p.visits).length * XP.lessonOpened;
  xp += Object.keys(p.completed).length * XP.lessonCompleted;
  xp += Object.values(p.exercises).filter(e => e.done).length * XP.exerciseDone;
  for (const attempts of Object.values(p.quiz)) {
    xp += attempts.length * XP.quizAttempt;
    if (attempts.some(a => a.passed)) xp += XP.quizPassed;
  }
  xp += Object.values(p.srs).reduce((n, c) => n + c.reps + c.lapses, 0) * XP.flashcardReview;
  xp += p.exams.length * XP.exam + p.interviews.length * XP.interview;
  return xp;
}

/** Level n starts at 50·(n−1)² XP: 0, 50, 200, 450, 800 … — fast early wins, slower later. */
export function levelFor(xp: number): { level: number; current: number; next: number; pct: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const current = 50 * (level - 1) ** 2;
  const next = 50 * level ** 2;
  return { level, current, next, pct: ((xp - current) / (next - current)) * 100 };
}

export const LEVEL_TITLES = ['Newcomer', 'Apprentice', 'Builder', 'Designer', 'Engineer', 'Senior Engineer', 'Tech Lead', 'Architect', 'Principal', 'Distinguished'];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

/** XP earned per local day, from timestamped records. */
export function xpByDay(p: ProgressState): Map<string, number> {
  const m = new Map<string, number>();
  const add = (at: string | undefined, n: number) => { if (at) { const k = dayKey(at); m.set(k, (m.get(k) ?? 0) + n); } };
  for (const a of p.activity) add(a.at, ACTIVITY_XP[a.kind] ?? 0);
  for (const e of Object.values(p.exercises)) if (e.done) add(e.doneAt, XP.exerciseDone);
  for (const attempts of Object.values(p.quiz)) { const first = attempts.find(a => a.passed); if (first) add(first.at, XP.quizPassed); }
  for (const c of Object.values(p.srs)) add(c.lastReviewed, XP.flashcardReview);
  // Days where the learner only read (time tracked, nothing logged) still count as active.
  for (const v of Object.values(p.visits)) if (!m.has(dayKey(v.last))) m.set(dayKey(v.last), 0);
  return m;
}

/** Consecutive active days ending today — or yesterday, so the streak is still "alive" until midnight. */
export function streak(p: ProgressState, now = new Date()): { days: number; activeToday: boolean } {
  const active = new Set(xpByDay(p).keys());
  const d = new Date(now);
  const activeToday = active.has(dayKey(d));
  if (!activeToday) d.setDate(d.getDate() - 1);
  let days = 0;
  while (active.has(dayKey(d))) { days++; d.setDate(d.getDate() - 1); }
  return { days, activeToday };
}

/** The last `n` days (oldest first) with XP earned each day. */
export function recentDays(p: ProgressState, n = 7, now = new Date()): { key: string; label: string; xp: number; active: boolean }[] {
  const by = xpByDay(p);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), xp: by.get(key) ?? 0, active: by.has(key) });
  }
  return out;
}

export function todayXp(p: ProgressState, now = new Date()): number { return xpByDay(p).get(dayKey(now)) ?? 0; }
