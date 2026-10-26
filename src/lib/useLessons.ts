import { useEffect, useState } from 'react';
import { loadAllWritten } from './content';
import type { ParsedLesson } from './lessonParser';

let all: ParsedLesson[] | null = null;
let pending: Promise<ParsedLesson[]> | null = null;

/** Loads and parses every written lesson once (used by Practice, Assessments, Search, Flashcards). */
export function useAllLessons(): ParsedLesson[] | null {
  const [lessons, setLessons] = useState<ParsedLesson[] | null>(all);
  useEffect(() => {
    if (all) return;
    pending ??= loadAllWritten().then(l => (all = l));
    let alive = true;
    pending.then(l => { if (alive) setLessons(l); });
    return () => { alive = false; };
  }, []);
  return lessons;
}
