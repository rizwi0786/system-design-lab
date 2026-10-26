// Curriculum manifest (generated at build time) plus lazy loading of lesson Markdown.
import manifestJson from '../generated/curriculum.json';
import { parseLesson, type ParsedLesson } from './lessonParser';

export interface ManifestLesson {
  id: string; title: string; level: 'beginner' | 'intermediate' | 'advanced'; topics: string[]; module: string; order: number;
  status: 'planned' | 'draft' | 'reviewed' | 'tested' | 'published'; hasContent: boolean; words: number; exercises: number;
  minutes: number; prerequisites: string[]; tags: string[]; patterns: string[]; summary: string; problems: string[];
}
export interface ManifestModule { id: string; number: number; title: string; track: Track; description: string; lessons: ManifestLesson[] }
export type Track = 'foundations' | 'lld' | 'hld' | 'ops' | 'career';

export const TRACK_LABEL: Record<Track, string> = {
  foundations: 'Foundations', lld: 'Low-level design', hld: 'High-level design', ops: 'Operations & security', career: 'Interviews & capstones',
};
export const TRACK_COLOR: Record<Track, string> = {
  foundations: 'var(--color-t-foundations)', lld: 'var(--color-t-lld)', hld: 'var(--color-t-hld)', ops: 'var(--color-t-ops)', career: 'var(--color-t-career)',
};

const manifest = manifestJson as unknown as { generatedAt: string; modules: ManifestModule[] };
export const modules: ManifestModule[] = manifest.modules;
export const allLessons: ManifestLesson[] = modules.flatMap(m => m.lessons);
export const lessonById = new Map(allLessons.map(l => [l.id, l]));
export const moduleById = new Map(modules.map(m => [m.id, m]));
export const writtenLessons = allLessons.filter(l => l.hasContent);

export function lessonIndex(id: string): number { return allLessons.findIndex(l => l.id === id); }
export function prevNext(id: string): { prev?: ManifestLesson; next?: ManifestLesson } {
  const i = lessonIndex(id);
  return { prev: i > 0 ? allLessons[i - 1] : undefined, next: i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : undefined };
}

// Vite turns this into one lazily-loaded chunk per lesson file.
const sources = import.meta.glob('/content/lessons/**/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const loaderById = new Map<string, () => Promise<string>>();
for (const [path, loader] of Object.entries(sources)) {
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  loaderById.set(id, loader);
}

const cache = new Map<string, Promise<ParsedLesson | null>>();
export function loadLesson(id: string): Promise<ParsedLesson | null> {
  if (!cache.has(id)) {
    const loader = loaderById.get(id);
    cache.set(id, loader ? loader().then(src => parseLesson(src, id)) : Promise.resolve(null));
  }
  return cache.get(id)!;
}
export const hasSource = (id: string) => loaderById.has(id);

export async function loadAllWritten(): Promise<ParsedLesson[]> {
  const out = await Promise.all(writtenLessons.map(l => loadLesson(l.id)));
  return out.filter((x): x is ParsedLesson => x !== null);
}

export function contentStats() {
  const total = allLessons.length;
  const written = writtenLessons.length;
  const reviewed = allLessons.filter(l => ['reviewed', 'tested', 'published'].includes(l.status)).length;
  const drafts = allLessons.filter(l => l.hasContent && l.status === 'draft').length;
  const exercises = allLessons.reduce((n, l) => n + l.exercises, 0);
  return { total, written, reviewed, drafts, planned: total - written, exercises, modules: modules.length };
}
