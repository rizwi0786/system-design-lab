// Parses lesson Markdown (YAML frontmatter + Markdown + ::: directive blocks).
// Shared by the web app and the Node validator script, so it has no browser/Node-only imports.
import { parse as parseYaml } from 'yaml';

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type ContentStatus = 'planned' | 'draft' | 'reviewed' | 'tested' | 'published';
export type LessonTemplate = 'lesson' | 'hld-case' | 'lld-case' | 'capstone';

export interface LessonMeta {
  id: string;
  title: string;
  module: string;
  level: Level;
  status: ContentStatus;
  template: LessonTemplate;
  minutes: number;
  prerequisites: string[];
  related: string[];
  tags: string[];
  patterns: string[];
  summary: string;
  references: { title: string; url: string }[];
}

export interface QuizQuestion {
  id: string;
  kind: 'single' | 'multi';
  prompt: string;
  options: string[];
  answer: number[];
  explanation: string;
}
export interface Quiz { passMark: number; questions: QuizQuestion[] }

export interface CodeFile { name: string; language: string; code: string; explicitName?: boolean }

export interface Exercise {
  id: string;
  title: string;
  difficulty: Level;
  kind: 'code' | 'design' | 'sql' | 'hld' | 'written';
  description: string;
  requirements: string;
  acceptance: string[];
  hints: string[];
  starter: CodeFile[];
  tests: CodeFile[];
  solution: string;
  alternatives: string;
  mistakes: string[];
  extensions: string;
  sqlSetup?: string;
  sqlSolution?: string;
  ordered?: boolean;
}

export interface Flashcard { front: string; back: string }
export interface InterviewQ { level: Level; question: string; answer: string }

export type Block =
  | { type: 'markdown'; text: string }
  | { type: 'quiz'; quiz: Quiz }
  | { type: 'exercise'; exercise: Exercise }
  | { type: 'flashcards'; cards: Flashcard[] }
  | { type: 'interview'; questions: InterviewQ[] }
  | { type: 'callout'; kind: string; title: string; text: string }
  | { type: 'playground'; kind: string; attrs: Record<string, string>; body: string; files: CodeFile[] }
  | { type: 'unknown'; name: string; body: string };

export interface Section { id: string; title: string; blocks: Block[] }

export interface ParsedLesson {
  meta: LessonMeta;
  intro: Block[];
  sections: Section[];
  exercises: Exercise[];
  quiz: Quiz | null;
  flashcards: Flashcard[];
  interview: InterviewQ[];
  wordCount: number;
  mermaidCount: number;
  csharpBlockCount: number;
  errors: string[];
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[`'’"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/** Splits text into lines and reports, for each line, whether it lies inside a fenced code block. */
const openers = new WeakMap<boolean[], (string | null)[]>();
function fenceMap(lines: string[]): boolean[] {
  const inside: boolean[] = [];
  const info: (string | null)[] = [];
  let open: string | null = null;
  for (const line of lines) {
    const m = line.match(FENCE);
    if (open) {
      inside.push(true); info.push(null);
      if (m && m[1][0] === open[0] && m[1].length >= open.length && line.trim().replace(/[`~]/g, '') === '') open = null;
    } else if (m) {
      inside.push(true);
      info.push(line.trim().slice(m[1].length).trim().split(/\s+/)[0].toLowerCase());
      open = m[1];
    } else { inside.push(false); info.push(null); }
  }
  openers.set(inside, info);
  return inside;
}
/** Language of the fence opened on line i, or null if line i is not a fence opener. */
function fenceLang(inside: boolean[], i: number): string | null { return openers.get(inside)?.[i] ?? null; }

/** Extract fenced code blocks from markdown into CodeFile[] (title/file attribute names the file). */
export function extractCodeFiles(md: string, fallbackName = 'Program.cs'): CodeFile[] {
  const files: CodeFile[] = [];
  const re = /^(`{3,})([^\n]*)\n([\s\S]*?)\n\1[ \t]*$/gm;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(md))) {
    const info = m[2].trim();
    const language = (info.split(/\s+/)[0] || 'text').toLowerCase();
    const attrs = parseAttrs(info);
    const name = attrs.file || attrs.title || (i === 0 ? fallbackName : `File${i + 1}.${language === 'csharp' || language === 'cs' ? 'cs' : 'txt'}`);
    files.push({ name, language, code: m[3], explicitName: Boolean(attrs.file || attrs.title) });
    i++;
  }
  return files;
}

/** Split a directive body into "::name" subsections (outside code fences). */
function subsections(body: string): { name: string; arg: string; text: string }[] {
  const lines = body.split('\n');
  const inside = fenceMap(lines);
  const out: { name: string; arg: string; text: string }[] = [];
  let cur = { name: '', arg: '', lines: [] as string[] };
  lines.forEach((line, idx) => {
    const m = !inside[idx] ? line.match(/^::([a-z][\w-]*)\s*(.*)$/i) : null;
    if (m) {
      if (cur.name || cur.lines.join('').trim()) out.push({ name: cur.name, arg: cur.arg, text: cur.lines.join('\n').trim() });
      cur = { name: m[1].toLowerCase(), arg: m[2].trim(), lines: [] };
    } else cur.lines.push(line);
  });
  if (cur.name || cur.lines.join('').trim()) out.push({ name: cur.name, arg: cur.arg, text: cur.lines.join('\n').trim() });
  return out;
}

function bulletList(text: string): string[] {
  const items: string[] = [];
  for (const raw of text.split('\n')) {
    const m = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (m) items.push(m[1].trim());
    else if (raw.trim() && items.length) items[items.length - 1] += ' ' + raw.trim();
  }
  return items;
}

function parseQuiz(attrs: Record<string, string>, body: string, errors: string[], lessonId: string): Quiz {
  const questions: QuizQuestion[] = [];
  for (const sub of subsections(body)) {
    if (sub.name !== 'q') continue;
    const kind = sub.arg.startsWith('multi') ? 'multi' : 'single';
    const promptLines: string[] = [];
    const options: string[] = [];
    const answer: number[] = [];
    const expl: string[] = [];
    for (const line of sub.text.split('\n')) {
      const opt = line.match(/^\s*-\s*\[( |x|X)\]\s+(.*)$/);
      if (opt) {
        if (opt[1].toLowerCase() === 'x') answer.push(options.length);
        options.push(opt[2].trim());
      } else if (/^\s*>/.test(line)) expl.push(line.replace(/^\s*>\s?/, ''));
      else if (!options.length) promptLines.push(line);
    }
    const q: QuizQuestion = {
      id: `${lessonId}-q${questions.length + 1}`,
      kind,
      prompt: promptLines.join('\n').trim(),
      options,
      answer,
      explanation: expl.join('\n').trim(),
    };
    if (options.length < 2) errors.push(`quiz question ${q.id} has fewer than 2 options`);
    if (!answer.length) errors.push(`quiz question ${q.id} has no correct answer marked [x]`);
    if (kind === 'single' && answer.length > 1) errors.push(`quiz question ${q.id} is single-choice but has ${answer.length} answers`);
    if (!q.explanation) errors.push(`quiz question ${q.id} has no explanation (> line)`);
    questions.push(q);
  }
  return { passMark: Number(attrs.pass ?? 70), questions };
}

function parseExercise(attrs: Record<string, string>, body: string, errors: string[], lessonId: string, n: number): Exercise {
  const ex: Exercise = {
    id: attrs.id || `${lessonId}-ex${n}`,
    title: attrs.title || `Exercise ${n}`,
    difficulty: (attrs.difficulty as Level) || 'beginner',
    kind: (attrs.kind as Exercise['kind']) || 'code',
    description: '', requirements: '', acceptance: [], hints: [], starter: [], tests: [],
    solution: '', alternatives: '', mistakes: [], extensions: '',
    ordered: attrs.ordered === 'true',
  };
  for (const sub of subsections(body)) {
    switch (sub.name) {
      case '': case 'description': ex.description = sub.text; break;
      case 'requirements': ex.requirements = sub.text; break;
      case 'acceptance': ex.acceptance = bulletList(sub.text); break;
      case 'hint': ex.hints.push(sub.text); break;
      case 'starter': ex.starter = extractCodeFiles(sub.text, 'Program.cs'); break;
      case 'tests': ex.tests = extractCodeFiles(sub.text, 'Tests.cs'); break;
      case 'solution': ex.solution = sub.text; break;
      case 'alternatives': ex.alternatives = sub.text; break;
      case 'mistakes': ex.mistakes = bulletList(sub.text); break;
      case 'extensions': ex.extensions = sub.text; break;
      case 'setup': ex.sqlSetup = (extractCodeFiles(sub.text)[0]?.code) ?? sub.text; break;
      case 'check': ex.sqlSolution = (extractCodeFiles(sub.text)[0]?.code) ?? sub.text; break;
      default: errors.push(`exercise ${ex.id}: unknown subsection ::${sub.name}`);
    }
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(ex.difficulty)) errors.push(`exercise ${ex.id}: bad difficulty ${ex.difficulty}`);
  if (!ex.description) errors.push(`exercise ${ex.id}: missing description`);
  if (!ex.acceptance.length) errors.push(`exercise ${ex.id}: missing ::acceptance bullets`);
  if (ex.hints.length < 3) errors.push(`exercise ${ex.id}: needs at least 3 progressive ::hint entries (has ${ex.hints.length})`);
  if (!ex.solution) errors.push(`exercise ${ex.id}: missing ::solution`);
  if (ex.kind === 'sql' && !ex.sqlSolution) errors.push(`exercise ${ex.id}: sql exercise needs ::check (reference query)`);
  return ex;
}

function parseFlashcards(body: string): Flashcard[] {
  const cards: Flashcard[] = [];
  let cur: Flashcard | null = null;
  let mode: 'front' | 'back' | null = null;
  for (const line of body.split('\n')) {
    const q = line.match(/^Q:\s*(.*)$/);
    const a = line.match(/^A:\s*(.*)$/);
    if (q) { if (cur) cards.push(cur); cur = { front: q[1], back: '' }; mode = 'front'; }
    else if (a && cur) { cur.back = a[1]; mode = 'back'; }
    else if (cur && line.trim()) { if (mode === 'front') cur.front += '\n' + line; else cur.back += '\n' + line; }
  }
  if (cur) cards.push(cur);
  return cards.filter(c => c.front && c.back);
}

function parseInterview(body: string): InterviewQ[] {
  const out: InterviewQ[] = [];
  let cur: InterviewQ | null = null;
  for (const sub of subsections(body)) {
    if (sub.name === 'q') {
      if (cur) out.push(cur);
      cur = { level: (sub.arg.split(/\s+/)[0] as Level) || 'beginner', question: sub.text, answer: '' };
    } else if (sub.name === 'a' && cur) cur.answer = sub.text;
  }
  if (cur) out.push(cur);
  return out;
}

export function emptyMeta(id: string): LessonMeta {
  return { id, title: id, module: '', level: 'beginner', status: 'draft', template: 'lesson', minutes: 30, prerequisites: [], related: [], tags: [], patterns: [], summary: '', references: [] };
}

export function parseLesson(source: string, fallbackId = 'lesson'): ParsedLesson {
  const errors: string[] = [];
  let body = source.replace(/\r\n/g, '\n');
  let meta = emptyMeta(fallbackId);
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    try {
      const y = (parseYaml(fm[1]) ?? {}) as Partial<LessonMeta>;
      meta = { ...meta, ...y, prerequisites: y.prerequisites ?? [], related: y.related ?? [], tags: y.tags ?? [], patterns: y.patterns ?? [], references: y.references ?? [] } as LessonMeta;
    } catch (e) { errors.push(`frontmatter YAML error: ${(e as Error).message}`); }
    body = body.slice(fm[0].length);
  } else errors.push('missing YAML frontmatter');

  const lines = body.split('\n');
  const inside = fenceMap(lines);
  const intro: Block[] = [];
  const sections: Section[] = [];
  const exercises: Exercise[] = [];
  const flashcards: Flashcard[] = [];
  const interview: InterviewQ[] = [];
  let quiz: Quiz | null = null;
  let target: Block[] = intro;
  let md: string[] = [];
  let mermaidCount = 0;
  let csharpBlockCount = 0;
  let words = 0;

  const flush = () => {
    const text = md.join('\n');
    if (text.trim()) target.push({ type: 'markdown', text });
    md = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inside[i]) words += line.replace(/[#>*`_\-|[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
    const lang = fenceLang(inside, i);
    if (lang === 'mermaid') mermaidCount++;
    if (lang === 'csharp' || lang === 'cs') csharpBlockCount++;
    const h2 = !inside[i] ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (h2) {
      flush();
      const sec: Section = { id: slugify(h2[1]), title: h2[1], blocks: [] };
      sections.push(sec);
      target = sec.blocks;
      continue;
    }
    const open = !inside[i] ? line.match(/^:::([a-z][\w-]*)\s*(.*)$/i) : null;
    if (open) {
      flush();
      const name = open[1].toLowerCase();
      const attrs = parseAttrs(open[2]);
      const bodyLines: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        if (!inside[j] && /^:::\s*$/.test(lines[j])) { closed = true; break; }
        bodyLines.push(lines[j]);
        if (!inside[j]) words += lines[j].split(/\s+/).filter(Boolean).length;
        const l2 = fenceLang(inside, j);
        if (l2 === 'mermaid') mermaidCount++;
        if (l2 === 'csharp' || l2 === 'cs') csharpBlockCount++;
      }
      if (!closed) errors.push(`:::${name} opened on line ${i + 1} was never closed with :::`);
      const blockBody = bodyLines.join('\n');
      i = j;
      switch (name) {
        case 'quiz': quiz = parseQuiz(attrs, blockBody, errors, meta.id); target.push({ type: 'quiz', quiz }); break;
        case 'exercise': {
          const ex = parseExercise(attrs, blockBody, errors, meta.id, exercises.length + 1);
          exercises.push(ex); target.push({ type: 'exercise', exercise: ex }); break;
        }
        case 'flashcards': { const c = parseFlashcards(blockBody); flashcards.push(...c); target.push({ type: 'flashcards', cards: c }); break; }
        case 'interview': { const q = parseInterview(blockBody); interview.push(...q); target.push({ type: 'interview', questions: q }); break; }
        case 'callout': target.push({ type: 'callout', kind: attrs.type || 'note', title: attrs.title || '', text: blockBody }); break;
        case 'playground': target.push({ type: 'playground', kind: attrs.type || 'csharp', attrs, body: blockBody, files: extractCodeFiles(blockBody) }); break;
        default: errors.push(`unknown directive :::${name}`); target.push({ type: 'unknown', name, body: blockBody });
      }
      continue;
    }
    md.push(line);
  }
  flush();
  const ids = new Set<string>();
  for (const ex of exercises) { if (ids.has(ex.id)) errors.push(`duplicate exercise id ${ex.id}`); ids.add(ex.id); }
  return { meta, intro, sections, exercises, quiz, flashcards, interview, wordCount: words, mermaidCount, csharpBlockCount, errors };
}

// ---------- validation ----------

export const REQUIRED_SECTIONS: Record<LessonTemplate, string[]> = {
  lesson: [
    'Learning objectives', 'Prerequisites', "Explain it like I'm a beginner", 'First-principles explanation',
    'Visual explanation', 'Step-by-step example', 'Production-style C# implementation', 'Bad design vs good design',
    'Practical playground', 'Exercises', 'Automated testing', 'Real-world application', 'Interview questions',
    'Summary and revision', 'Knowledge check', 'Completion criteria',
  ],
  'lld-case': [
    'Learning objectives', 'Prerequisites', "Explain it like I'm a beginner", 'Requirements', 'Identifying classes and responsibilities',
    'Class diagram', 'Patterns and design decisions', 'State transitions', 'C# implementation', 'Automated testing',
    'Bad design vs good design', 'Alternative designs', 'Practical playground', 'Exercises', 'Interview questions',
    'Summary and revision', 'Knowledge check', 'Completion criteria',
  ],
  'hld-case': [
    'Learning objectives', 'Prerequisites', "Explain it like I'm a beginner", 'Requirements', 'Capacity estimation',
    'API design', 'Data model', 'High-level architecture', 'Deep dives', 'Caching, queues and scaling', 'Failure handling',
    'Security', 'Observability', 'Deployment and cost', 'Alternatives and trade-offs', 'Practical playground', 'Exercises',
    'Interview questions', 'Summary and revision', 'Knowledge check', 'Completion criteria',
  ],
  capstone: [
    'Learning objectives', 'Prerequisites', 'Project brief', 'Deliverables', 'Milestones', 'Reference architecture',
    'Evaluation rubric', 'Exercises', 'Summary and revision', 'Knowledge check', 'Completion criteria',
  ],
};

export interface ValidationReport { id: string; ok: boolean; problems: string[]; warnings: string[] }

export function validateLesson(p: ParsedLesson, minWords = 1800): ValidationReport {
  const problems = [...p.errors];
  const warnings: string[] = [];
  const m = p.meta;
  for (const k of ['id', 'title', 'module', 'level', 'status', 'summary'] as const) if (!m[k]) problems.push(`frontmatter missing ${k}`);
  const required = REQUIRED_SECTIONS[m.template] ?? REQUIRED_SECTIONS.lesson;
  const have = new Set(p.sections.map(s => slugify(s.title)));
  for (const r of required) if (!have.has(slugify(r))) problems.push(`missing section "## ${r}"`);
  if (p.mermaidCount < 1) problems.push('needs at least one ```mermaid diagram');
  const byLevel = { beginner: 0, intermediate: 0, advanced: 0 } as Record<Level, number>;
  p.exercises.forEach(e => byLevel[e.difficulty]++);
  if (p.exercises.length < 5) problems.push(`needs >= 5 exercises (has ${p.exercises.length})`);
  if (byLevel.beginner < 2) problems.push('needs >= 2 beginner exercises');
  if (byLevel.intermediate < 2) problems.push('needs >= 2 intermediate exercises');
  if (byLevel.advanced < 1) problems.push('needs >= 1 advanced exercise');
  if (!p.quiz || p.quiz.questions.length < 5) problems.push(`needs a :::quiz with >= 5 questions (has ${p.quiz?.questions.length ?? 0})`);
  if (p.flashcards.length < 5) problems.push(`needs >= 5 flashcards (has ${p.flashcards.length})`);
  const levels = new Set(p.interview.map(q => q.level));
  if (p.interview.length < 3 || levels.size < 3) problems.push('needs interview questions at beginner, intermediate and advanced levels');
  if (m.template !== 'capstone' && p.csharpBlockCount < 1 && m.template !== 'hld-case') problems.push('needs at least one ```csharp code block');
  if (p.wordCount < minWords) problems.push(`too short: ${p.wordCount} words (min ${minWords})`);
  if (p.wordCount > 9000) warnings.push(`very long: ${p.wordCount} words`);
  return { id: m.id, ok: problems.length === 0, problems, warnings };
}
