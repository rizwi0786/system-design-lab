import { emptyProgress, completionStatus, lessonMastery, recommendations, weakTopics, moduleMastery, requiredExercises, type ProgressState, type LessonInfo } from '../progress';

const attempt = (score: number, passMark = 70) => ({ at: new Date().toISOString(), correct: 0, total: 6, score, passMark, passed: score >= passMark, answers: {} });
const ex = (lessonId: string, done: boolean, hintsUsed = 0) => ({ lessonId, done, hintsUsed, solutionViewed: false, attempts: 1 });

describe('completion', () => {
  it('requires a passed quiz and two exercises', () => {
    const s: ProgressState = emptyProgress();
    const l = { id: 'a', exercises: 5 };
    expect(completionStatus(s, l).complete).toBe(false);
    s.quiz.a = [attempt(50)];
    s.exercises = { e1: ex('a', true), e2: ex('a', true) };
    expect(completionStatus(s, l).complete).toBe(false);
    s.quiz.a.push(attempt(83));
    expect(completionStatus(s, l)).toMatchObject({ complete: true, bestScore: 83, exercisesDone: 2 });
  });
  it('opening a lesson does not complete it', () => {
    const s = emptyProgress();
    s.visits.a = { first: '', last: '', count: 3, seconds: 900 };
    expect(completionStatus(s, { id: 'a', exercises: 5 }).complete).toBe(false);
  });
  it('requires fewer exercises when a lesson has fewer', () => { expect(requiredExercises(1)).toBe(1); expect(requiredExercises(7)).toBe(2); });
});

describe('mastery', () => {
  it('follows the documented formula', () => {
    const s = emptyProgress();
    s.quiz.a = [attempt(80)];
    s.exercises = { e1: ex('a', true), e2: ex('a', true), e3: ex('a', false, 5) };
    s.srs = { c1: { lessonId: 'a', ease: 2.5, interval: 1, reps: 1, lapses: 0, due: '', lastGrade: 4 }, c2: { lessonId: 'a', ease: 2.5, interval: 0, reps: 0, lapses: 1, due: '', lastGrade: 1 } };
    // 0.5*0.8 + 0.3*(2/5) + 0.2*0.5 = 0.4 + 0.12 + 0.1 = 0.62
    expect(lessonMastery(s, { id: 'a', exercises: 5 })).toBe(62);
  });
  it('hints do not lower mastery', () => {
    const s = emptyProgress();
    s.quiz.a = [attempt(100)];
    s.exercises = { e1: ex('a', true, 6) };
    const withHints = lessonMastery(s, { id: 'a', exercises: 2 });
    s.exercises = { e1: ex('a', true, 0) };
    expect(lessonMastery(s, { id: 'a', exercises: 2 })).toBe(withHints);
  });
  it('averages written lessons in a module', () => {
    const s = emptyProgress();
    s.quiz.a = [attempt(100)];
    expect(moduleMastery(s, [{ id: 'a', exercises: 0, hasContent: true }, { id: 'b', exercises: 0, hasContent: true }, { id: 'c', exercises: 0, hasContent: false }]).mastery).toBe(25);
  });
});

describe('weak topics and recommendations', () => {
  const lessons: LessonInfo[] = [
    { id: 'base', title: 'Base', exercises: 5, prerequisites: [], hasContent: true, module: 'm1' },
    { id: 'mid', title: 'Mid', exercises: 5, prerequisites: ['base'], hasContent: true, module: 'm1' },
    { id: 'planned', title: 'Planned', exercises: 0, prerequisites: [], hasContent: false, module: 'm1' },
    { id: 'top', title: 'Top', exercises: 5, prerequisites: ['mid', 'planned'], hasContent: true, module: 'm1' },
  ];
  it('recommends the first lesson whose prerequisites are met', () => {
    const r = recommendations(emptyProgress(), lessons);
    expect(r[0]).toMatchObject({ lessonId: 'base', kind: 'next' });
    expect(r.some(x => x.lessonId === 'mid')).toBe(false);
  });
  it('planned prerequisites do not block', () => {
    const s = emptyProgress();
    s.completed = { base: 'x', mid: 'x' };
    expect(recommendations(s, lessons)[0].lessonId).toBe('top');
  });
  it('a failed quiz recommends incomplete prerequisites first', () => {
    const s = emptyProgress();
    s.quiz.mid = [attempt(40)];
    expect(weakTopics(s)[0].lessonId).toBe('mid');
    const r = recommendations(s, lessons);
    expect(r[0]).toMatchObject({ lessonId: 'base', kind: 'prerequisite' });
    expect(r[1]).toMatchObject({ lessonId: 'mid', kind: 'revise' });
  });
  it('flags heavy hint use', () => {
    const s = emptyProgress();
    s.exercises = { e1: ex('base', false, 4), e2: ex('base', true, 3) };
    expect(weakTopics(s).map(w => w.lessonId)).toContain('base');
  });
});
