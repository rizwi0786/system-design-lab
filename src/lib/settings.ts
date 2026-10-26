import { useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage';

export type Theme = 'light' | 'dark' | 'system';
export type LessonMode = 'study' | 'page';
export interface Settings { theme: Theme; fontScale: number; reduceMotion: boolean; quizMode: 'all' | 'one'; lessonMode: LessonMode }
const defaults: Settings = { theme: 'system', fontScale: 1, reduceMotion: false, quizMode: 'all', lessonMode: 'study' };

let settings: Settings = { ...defaults, ...readJson<Partial<Settings>>('settings', {}), theme: readJson<Theme>('theme', 'system') };
const listeners = new Set<() => void>();

export function isDark(theme: Theme = settings.theme): boolean {
  if (theme === 'system') return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return theme === 'dark';
}

export function applySettings() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark());
  document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  document.documentElement.style.setProperty('--reading-scale', String(settings.fontScale));
}

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  writeJson('settings', settings);
  writeJson('theme', settings.theme);
  applySettings();
  listeners.forEach(l => l());
}

export const getSettings = () => settings;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useSettings = () => useSyncExternalStore(subscribe, getSettings, getSettings);

/** Re-render subscribers (e.g. Mermaid) when the OS theme flips while theme = system. */
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (settings.theme === 'system') { applySettings(); settings = { ...settings }; listeners.forEach(l => l()); }
  });
}
