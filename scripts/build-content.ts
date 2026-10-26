// Builds src/generated/curriculum.json from content/curriculum.txt and validates every lesson file.
// Usage: node scripts/build-content.ts [--strict] [--only <lessonId>]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLesson, validateLesson } from '../src/lib/lessonParser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

interface ManifestLesson { id: string; title: string; level: string; topics: string[]; module: string; order: number; status: string; hasContent: boolean; words: number; exercises: number; minutes: number; prerequisites: string[]; tags: string[]; patterns: string[]; summary: string; problems: string[] }
interface ManifestModule { id: string; number: number; title: string; track: string; description: string; lessons: ManifestLesson[] }

const modules: ManifestModule[] = [];
let order = 0;
for (const raw of readFileSync(join(root, 'content/curriculum.txt'), 'utf8').split('\n')) {
  const line = raw.trim();
  if (!line || (line.startsWith('#') && !line.startsWith('##'))) continue;
  if (line.startsWith('## ')) {
    const [id, title, track, description] = line.slice(3).split('|').map(s => s.trim());
    modules.push({ id, number: Number(id.slice(1)), title, track, description, lessons: [] });
    continue;
  }
  const [id, title, level, topics] = line.split('|').map(s => s.trim());
  const mod = modules[modules.length - 1];
  mod.lessons.push({ id, title, level, topics: (topics ?? '').split(';').map(s => s.trim()).filter(Boolean), module: mod.id, order: order++, status: 'planned', hasContent: false, words: 0, exercises: 0, minutes: 0, prerequisites: [], tags: [], patterns: [], summary: '', problems: [] });
}

const allIds = new Set(modules.flatMap(m => m.lessons.map(l => l.id)));
let failures = 0;
let withContent = 0;
const report: string[] = [];

for (const mod of modules) {
  const dir = join(root, 'content/lessons', mod.id);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const id = f.replace(/\.md$/, '');
      if (!allIds.has(id)) { report.push(`ORPHAN  ${mod.id}/${f} is not listed in curriculum.txt`); failures++; }
    }
  }
  for (const l of mod.lessons) {
    const file = join(dir, `${l.id}.md`);
    if (!existsSync(file)) continue;
    if (only && l.id !== only) { l.hasContent = true; l.status = 'draft'; continue; }
    const parsed = parseLesson(readFileSync(file, 'utf8'), l.id);
    const v = validateLesson(parsed);
    if (parsed.meta.id !== l.id) v.problems.push(`frontmatter id "${parsed.meta.id}" != file name "${l.id}"`);
    if (parsed.meta.module !== mod.id) v.problems.push(`frontmatter module "${parsed.meta.module}" != "${mod.id}"`);
    for (const p of [...parsed.meta.prerequisites, ...parsed.meta.related]) if (!allIds.has(p)) v.problems.push(`unknown prerequisite/related id "${p}"`);
    l.hasContent = true;
    withContent++;
    l.words = parsed.wordCount;
    l.exercises = parsed.exercises.length;
    l.minutes = parsed.meta.minutes;
    l.prerequisites = parsed.meta.prerequisites;
    l.tags = parsed.meta.tags;
    l.patterns = parsed.meta.patterns;
    l.summary = parsed.meta.summary;
    l.problems = v.problems;
    // A lesson that fails validation can never be shown as more than "draft".
    l.status = v.ok ? parsed.meta.status : 'draft';
    if (!v.ok) failures++;
    report.push(`${v.ok ? 'OK    ' : 'FAIL  '} ${l.id.padEnd(40)} ${String(parsed.wordCount).padStart(5)}w ${parsed.exercises.length}ex ${parsed.quiz?.questions.length ?? 0}q ${parsed.flashcards.length}fc ${parsed.mermaidCount}dia`);
    for (const p of v.problems) report.push(`         - ${p}`);
    for (const w of v.warnings) report.push(`         ~ ${w}`);
  }
}

mkdirSync(join(root, 'src/generated'), { recursive: true });
// --only is a quick single-lesson check: it must not overwrite the manifest with unvalidated statuses.
if (!only) writeFileSync(join(root, 'src/generated/curriculum.json'), JSON.stringify({ generatedAt: new Date().toISOString(), modules }, null, 1));
const total = modules.reduce((n, m) => n + m.lessons.length, 0);
console.log(report.join('\n'));
console.log(`\n${modules.length} modules, ${total} lessons, ${withContent} with content, ${failures} validation failures.`);
if (strict && failures) process.exit(1);
