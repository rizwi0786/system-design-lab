import { emptyProgress, type ProgressState } from '../progress';
import { dayKey, levelFor, recentDays, streak, todayXp, totalXp, XP } from '../gamify';

const at = (d: Date, h = 12) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const daysAgo = (n: number, now: Date) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

describe('gamify', () => {
  const now = new Date(2026, 9, 20, 18, 0, 0);

  it('levels grow quadratically', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, current: 0, next: 50 });
    expect(levelFor(50).level).toBe(2);
    expect(levelFor(199).level).toBe(2);
    expect(levelFor(200).level).toBe(3);
    expect(levelFor(125).pct).toBeCloseTo(50);
  });

  it('computes XP from recorded progress only', () => {
    const p: ProgressState = { ...emptyProgress(),
      visits: { a: { first: at(now), last: at(now), count: 1, seconds: 60 } },
      completed: { a: at(now) },
      exercises: { x: { lessonId: 'a', done: true, doneAt: at(now), hintsUsed: 0, solutionViewed: false, attempts: 1 } },
      quiz: { a: [{ at: at(now), correct: 1, total: 1, score: 100, passMark: 70, passed: true, answers: {} }] },
    };
    expect(totalXp(p)).toBe(XP.lessonOpened + XP.lessonCompleted + XP.exerciseDone + XP.quizAttempt + XP.quizPassed);
    expect(totalXp(emptyProgress())).toBe(0);
  });

  it('counts a streak of consecutive days, kept alive until the end of today', () => {
    const p: ProgressState = { ...emptyProgress(), activity: [1, 2, 3, 5].map(n => ({ at: at(daysAgo(n, now)), kind: 'quiz' as const, detail: '' })) };
    expect(streak(p, now)).toEqual({ days: 3, activeToday: false });
    p.activity.unshift({ at: at(now), kind: 'visit', detail: '' });
    expect(streak(p, now)).toEqual({ days: 4, activeToday: true });
    expect(todayXp(p, now)).toBe(XP.lessonOpened);
    expect(streak(emptyProgress(), now).days).toBe(0);
  });

  it('lists the last 7 days oldest first', () => {
    const days = recentDays({ ...emptyProgress(), activity: [{ at: at(now), kind: 'complete', detail: '' }] }, 7, now);
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ key: dayKey(now), xp: XP.lessonCompleted, active: true });
    expect(days[0].active).toBe(false);
  });
});
