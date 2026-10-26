// SM-2 spaced repetition (Wozniak, 1990), slightly simplified: a failed card comes back in 10 minutes.
export interface SrsCard {
  lessonId: string;
  ease: number;        // easiness factor, starts at 2.5, never below 1.3
  interval: number;    // days
  reps: number;        // consecutive successful reviews
  lapses: number;
  due: string;         // ISO date-time
  lastGrade?: number;  // 0..5
  lastReviewed?: string;
}

export type Grade = 1 | 3 | 4 | 5; // Again, Hard, Good, Easy
export const GRADE_LABEL: Record<Grade, string> = { 1: 'Again', 3: 'Hard', 4: 'Good', 5: 'Easy' };

export function newCard(lessonId: string, now = new Date()): SrsCard {
  return { lessonId, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now.toISOString() };
}

export function review(card: SrsCard, grade: Grade, now = new Date()): SrsCard {
  const q = grade;
  let { ease, interval, reps, lapses } = card;
  let due: Date;
  if (q < 3) {
    reps = 0;
    interval = 0;
    lapses += 1;
    due = new Date(now.getTime() + 10 * 60 * 1000);
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
    due = new Date(now.getTime() + interval * 86_400_000);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ...card, ease: Math.round(ease * 100) / 100, interval, reps, lapses, due: due.toISOString(), lastGrade: q, lastReviewed: now.toISOString() };
}

export function isDue(card: SrsCard, now = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/** Stable id for a card so edits to other cards in the lesson don't reshuffle review history. */
export function cardId(lessonId: string, front: string): string {
  let h = 2166136261;
  for (let i = 0; i < front.length; i++) { h ^= front.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${lessonId}:${(h >>> 0).toString(36)}`;
}
