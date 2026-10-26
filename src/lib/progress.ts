// Learner progress: a single versioned JSON document persisted through src/lib/storage.ts.
// All derived numbers (completion, mastery, weak topics, recommendations) are pure functions of this state,
// so the dashboard only ever shows what the learner actually did.
import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage';
import { review, newCard, isDue, type Grade, type SrsCard } from './srs';

export interface QuizAttempt { at: string; correct: number; total: number; score: number; passMark: number; passed: boolean; answers: Record<string, number[]> }
export interface ExerciseRecord {
  lessonId: string; done: boolean; doneAt?: string; hintsUsed: number; solutionViewed: boolean;
  answer?: string; code?: Record<string, string>; attempts: number; autoChecked?: boolean;
}
export interface Bookmark { lessonId: string; sectionId?: string; title: string; at: string }
export interface Activity { at: string; kind: 'visit' | 'quiz' | 'exercise' | 'complete' | 'flashcard' | 'note' | 'bookmark' | 'exam' | 'interview' | 'hint' | 'solution'; lessonId?: string; detail: string }
export interface VisitRecord { first: string; last: string; count: number; seconds: number }
export interface ProjectRecord { checks: Record<string, boolean>; notes: string }
export interface ExamRecord { at: string; correct: number; total: number; seconds: number; lessons: string[] }
export interface InterviewRecord { at: string; lessonId: string; question: string; selfScore: number; seconds: number }

export interface ProgressState {
  version: 1;
  visits: Record<string, VisitRecord>;
  quiz: Record<string, QuizAttempt[]>;
  exercises: Record<string, ExerciseRecord>;
  srs: Record<string, SrsCard>;
  notes: Record<string, string>;
  exerciseNotes: Record<string, string>;
  bookmarks: Bookmark[];
  activity: Activity[];
  completed: Record<string, string>;
  projects: Record<string, ProjectRecord>;
  exams: ExamRecord[];
  interviews: InterviewRecord[];
}

export const emptyProgress = (): ProgressState => ({
  version: 1, visits: {}, quiz: {}, exercises: {}, srs: {}, notes: {}, exerciseNotes: {}, bookmarks: [], activity: [],
  completed: {}, projects: {}, exams: [], interviews: [],
});

const KEY = 'progress';
let state: ProgressState = normalise(readJson<Partial<ProgressState>>(KEY, emptyProgress()));
const listeners = new Set<() => void>();

function normalise(s: Partial<ProgressState> | null | undefined): ProgressState {
  const base = emptyProgress();
  if (!s || typeof s !== 'object') return base;
  return { ...base, ...s, version: 1 } as ProgressState;
}

export function getProgress(): ProgressState { return state; }
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function commit(next: ProgressState) { state = next; writeJson(KEY, next); listeners.forEach(l => l()); }
export function useProgress(): ProgressState { return useSyncExternalStore(subscribe, getProgress, getProgress); }

const now = () => new Date().toISOString();
function log(s: ProgressState, a: Omit<Activity, 'at'>): Activity[] { return [{ ...a, at: now() }, ...s.activity].slice(0, 300); }

// ---------- mutations ----------
export const actions = {
  visit(lessonId: string) {
    const v = state.visits[lessonId];
    const isNew = !v;
    commit({
      ...state,
      visits: { ...state.visits, [lessonId]: { first: v?.first ?? now(), last: now(), count: (v?.count ?? 0) + 1, seconds: v?.seconds ?? 0 } },
      activity: isNew ? log(state, { kind: 'visit', lessonId, detail: 'Started lesson' }) : state.activity,
    });
  },
  addTime(lessonId: string, seconds: number) {
    const v = state.visits[lessonId];
    if (!v || seconds <= 0) return;
    commit({ ...state, visits: { ...state.visits, [lessonId]: { ...v, seconds: v.seconds + Math.round(seconds) } } });
  },
  recordQuiz(lessonId: string, attempt: Omit<QuizAttempt, 'at'>) {
    const a: QuizAttempt = { ...attempt, at: now() };
    commit({ ...state, quiz: { ...state.quiz, [lessonId]: [...(state.quiz[lessonId] ?? []), a] }, activity: log(state, { kind: 'quiz', lessonId, detail: `Quiz ${a.score}% (${a.passed ? 'passed' : 'not passed'})` }) });
  },
  updateExercise(exerciseId: string, lessonId: string, patch: Partial<ExerciseRecord>, activity?: Omit<Activity, 'at'>) {
    const cur: ExerciseRecord = state.exercises[exerciseId] ?? { lessonId, done: false, hintsUsed: 0, solutionViewed: false, attempts: 0 };
    commit({ ...state, exercises: { ...state.exercises, [exerciseId]: { ...cur, ...patch, lessonId } }, activity: activity ? log(state, activity) : state.activity });
  },
  revealHint(exerciseId: string, lessonId: string, count: number) {
    const cur = state.exercises[exerciseId];
    if (cur && cur.hintsUsed >= count) return;
    actions.updateExercise(exerciseId, lessonId, { hintsUsed: count }, { kind: 'hint', lessonId, detail: `Hint ${count} on ${exerciseId}` });
  },
  markExercise(exerciseId: string, lessonId: string, done: boolean, autoChecked = false) {
    const cur = state.exercises[exerciseId];
    actions.updateExercise(exerciseId, lessonId, { done, doneAt: done ? now() : undefined, attempts: (cur?.attempts ?? 0) + 1, autoChecked }, { kind: 'exercise', lessonId, detail: `${done ? 'Completed' : 'Reopened'} ${exerciseId}${autoChecked ? ' (auto-checked)' : ''}` });
  },
  setExerciseNote(exerciseId: string, text: string) { commit({ ...state, exerciseNotes: { ...state.exerciseNotes, [exerciseId]: text } }); },
  setNote(lessonId: string, text: string) { commit({ ...state, notes: { ...state.notes, [lessonId]: text } }); },
  toggleBookmark(b: Omit<Bookmark, 'at'>) {
    const exists = state.bookmarks.some(x => x.lessonId === b.lessonId && x.sectionId === b.sectionId);
    commit({
      ...state,
      bookmarks: exists ? state.bookmarks.filter(x => !(x.lessonId === b.lessonId && x.sectionId === b.sectionId)) : [{ ...b, at: now() }, ...state.bookmarks],
      activity: exists ? state.activity : log(state, { kind: 'bookmark', lessonId: b.lessonId, detail: `Bookmarked ${b.title}` }),
    });
  },
  addCards(lessonId: string, ids: string[]) {
    const srs = { ...state.srs };
    let added = 0;
    for (const id of ids) if (!srs[id]) { srs[id] = newCard(lessonId); added++; }
    if (added) commit({ ...state, srs, activity: log(state, { kind: 'flashcard', lessonId, detail: `Added ${added} flashcards to review` }) });
  },
  reviewCard(id: string, grade: Grade) {
    const c = state.srs[id];
    if (!c) return;
    commit({ ...state, srs: { ...state.srs, [id]: review(c, grade) } });
  },
  markComplete(lessonId: string) {
    if (state.completed[lessonId]) return;
    commit({ ...state, completed: { ...state.completed, [lessonId]: now() }, activity: log(state, { kind: 'complete', lessonId, detail: 'Lesson completed' }) });
  },
  unmarkComplete(lessonId: string) {
    if (!state.completed[lessonId]) return;
    const c = { ...state.completed }; delete c[lessonId];
    commit({ ...state, completed: c });
  },
  setProject(projectId: string, patch: Partial<ProjectRecord>) {
    const cur = state.projects[projectId] ?? { checks: {}, notes: '' };
    commit({ ...state, projects: { ...state.projects, [projectId]: { ...cur, ...patch, checks: { ...cur.checks, ...(patch.checks ?? {}) } } } });
  },
  recordExam(e: Omit<ExamRecord, 'at'>) { commit({ ...state, exams: [{ ...e, at: now() }, ...state.exams].slice(0, 100), activity: log(state, { kind: 'exam', detail: `Mock exam ${e.correct}/${e.total}` }) }); },
  recordInterview(r: Omit<InterviewRecord, 'at'>) { commit({ ...state, interviews: [{ ...r, at: now() }, ...state.interviews].slice(0, 200), activity: log(state, { kind: 'interview', lessonId: r.lessonId, detail: `Mock interview answer self-scored ${r.selfScore}/4` }) }); },
  importState(json: unknown) { commit(normalise(json as Partial<ProgressState>)); },
  reset() { commit(emptyProgress()); },
};

// ---------- derived values (pure) ----------
export interface LessonInfo { id: string; exercises: number; prerequisites: string[]; hasContent: boolean; module: string; title: string }

export function bestQuiz(s: ProgressState, lessonId: string): QuizAttempt | undefined {
  return (s.quiz[lessonId] ?? []).reduce<QuizAttempt | undefined>((b, a) => (!b || a.score > b.score ? a : b), undefined);
}
export function exercisesDone(s: ProgressState, lessonId: string): number {
  return Object.values(s.exercises).filter(e => e.lessonId === lessonId && e.done).length;
}
/** Exercises required for completion: 2, or all of them when a lesson has fewer than 2. */
export const requiredExercises = (exerciseCount: number) => Math.min(2, exerciseCount);

export interface CompletionStatus { quizPassed: boolean; bestScore: number | null; exercisesDone: number; exercisesRequired: number; complete: boolean }
export function completionStatus(s: ProgressState, lesson: { id: string; exercises: number }, hasQuiz = true): CompletionStatus {
  const best = bestQuiz(s, lesson.id);
  const quizPassed = hasQuiz ? !!(s.quiz[lesson.id] ?? []).some(a => a.passed) : true;
  const done = exercisesDone(s, lesson.id);
  const req = requiredExercises(lesson.exercises);
  return { quizPassed, bestScore: best ? best.score : null, exercisesDone: done, exercisesRequired: req, complete: quizPassed && done >= req };
}
export const isComplete = (s: ProgressState, id: string) => !!s.completed[id];

/** Fraction (0..1) of reviewed flashcards from this lesson whose most recent grade was Good or Easy. */
export function retention(s: ProgressState, lessonId: string): number | null {
  const cards = Object.values(s.srs).filter(c => c.lessonId === lessonId && c.lastGrade !== undefined);
  if (!cards.length) return null;
  return cards.filter(c => (c.lastGrade ?? 0) >= 4).length / cards.length;
}

export const MASTERY_FORMULA =
  'Mastery = 50% × best quiz score + 30% × (exercises marked done ÷ exercises in the lesson) + 20% × flashcard retention ' +
  '(share of this lesson\'s reviewed cards whose last answer was Good or Easy; 0 until you review any). Hints and viewing solutions never lower the score.';

export function lessonMastery(s: ProgressState, lesson: { id: string; exercises: number }): number {
  const q = (bestQuiz(s, lesson.id)?.score ?? 0) / 100;
  const ex = lesson.exercises ? Math.min(1, exercisesDone(s, lesson.id) / lesson.exercises) : 0;
  const r = retention(s, lesson.id) ?? 0;
  return Math.round((0.5 * q + 0.3 * ex + 0.2 * r) * 100);
}

export function moduleMastery(s: ProgressState, lessons: { id: string; exercises: number; hasContent: boolean }[]): { mastery: number; started: number; written: number; completed: number } {
  const written = lessons.filter(l => l.hasContent);
  const vals = written.map(l => lessonMastery(s, l));
  return {
    mastery: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    started: written.filter(l => s.visits[l.id]).length,
    written: written.length,
    completed: lessons.filter(l => s.completed[l.id]).length,
  };
}

export interface WeakTopic { lessonId: string; reason: string }
export function weakTopics(s: ProgressState): WeakTopic[] {
  const out: WeakTopic[] = [];
  for (const [lessonId, attempts] of Object.entries(s.quiz)) {
    if (!attempts.length) continue;
    const best = Math.max(...attempts.map(a => a.score));
    const pass = attempts[attempts.length - 1].passMark;
    if (best < pass) out.push({ lessonId, reason: `Best quiz score ${best}% is below the ${pass}% pass mark` });
  }
  const byLesson = new Map<string, number[]>();
  for (const e of Object.values(s.exercises)) if (e.hintsUsed > 0) byLesson.set(e.lessonId, [...(byLesson.get(e.lessonId) ?? []), e.hintsUsed]);
  for (const [lessonId, hints] of byLesson) {
    const avg = hints.reduce((a, b) => a + b, 0) / hints.length;
    if (avg >= 3 && !out.some(w => w.lessonId === lessonId)) out.push({ lessonId, reason: `You used ${avg.toFixed(1)} hints per exercise on average — worth a revision pass` });
  }
  const lapsed = new Map<string, number>();
  for (const c of Object.values(s.srs)) if (c.lapses >= 2) lapsed.set(c.lessonId, (lapsed.get(c.lessonId) ?? 0) + 1);
  for (const [lessonId, n] of lapsed) if (!out.some(w => w.lessonId === lessonId)) out.push({ lessonId, reason: `${n} flashcard(s) forgotten twice or more` });
  return out;
}

export interface Recommendation { lessonId: string; reason: string; kind: 'next' | 'revise' | 'prerequisite' }
/** Recommendation rules (documented on the Analytics page):
 * 1. For each lesson whose quiz was failed: recommend its incomplete prerequisites first, then a retry.
 * 2. Next lesson: the first written, incomplete lesson in course order whose written prerequisites are complete.
 *    Prerequisites that have no content yet do not block. */
export function recommendations(s: ProgressState, lessons: LessonInfo[], limit = 5): Recommendation[] {
  const byId = new Map(lessons.map(l => [l.id, l]));
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  const push = (r: Recommendation) => { if (!seen.has(r.lessonId) && out.length < limit) { seen.add(r.lessonId); out.push(r); } };
  for (const w of weakTopics(s)) {
    const l = byId.get(w.lessonId);
    if (!l) continue;
    for (const p of l.prerequisites) {
      const pl = byId.get(p);
      if (pl && pl.hasContent && !s.completed[p]) push({ lessonId: p, reason: `Prerequisite of “${l.title}”, where you are struggling`, kind: 'prerequisite' });
    }
    push({ lessonId: w.lessonId, reason: w.reason, kind: 'revise' });
  }
  for (const l of lessons) {
    if (!l.hasContent || s.completed[l.id]) continue;
    const blocked = l.prerequisites.some(p => byId.get(p)?.hasContent && !s.completed[p]);
    if (!blocked) { push({ lessonId: l.id, reason: s.visits[l.id] ? 'You started this lesson' : 'Next in course order with prerequisites met', kind: 'next' }); if (out.filter(r => r.kind === 'next').length >= 2) break; }
  }
  return out;
}

export function dueCards(s: ProgressState, at = new Date()): [string, SrsCard][] {
  return Object.entries(s.srs).filter(([, c]) => isDue(c, at)).sort((a, b) => a[1].due.localeCompare(b[1].due));
}

/** Hints used and solution views are informational; they never block completion. */
export function pendingExercises(s: ProgressState): [string, ExerciseRecord][] {
  return Object.entries(s.exercises).filter(([, e]) => !e.done && (e.hintsUsed > 0 || e.attempts > 0 || e.answer));
}
