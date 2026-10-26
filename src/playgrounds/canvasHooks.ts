// Hooks shared by the HLD and LLD canvases: undo/redo history, full screen and keyboard shortcuts.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { History } from './history';
import { readJson, writeJson } from '../lib/storage';

/**
 * Undo/redo over a serialized design. Changes are grouped: a burst of edits (dragging a node,
 * typing a label) becomes one history step once the design has been still for `delay` ms.
 * `restore` must put the canvas back into exactly the given serialized state. While `paused`
 * (e.g. mid-drag) nothing is recorded, so one gesture is always one step.
 */
export function useHistory(serialized: string, restore: (s: string) => void, { paused = false, delay = 300 } = {}) {
  const [history] = useState(() => new History(serialized));
  const [counts, setCounts] = useState({ undo: 0, redo: 0 });
  const latest = useRef(serialized);
  const sync = useCallback(() => setCounts({ undo: history.past.length, redo: history.future.length }), [history]);

  useEffect(() => {
    latest.current = serialized;
    if (paused || serialized === history.present) return;
    const t = setTimeout(() => { if (history.commit(serialized)) sync(); }, delay);
    return () => clearTimeout(t);
  }, [serialized, history, delay, sync, paused]);

  const flush = useCallback(() => { history.commit(latest.current); }, [history]);
  const undo = useCallback(() => {
    flush();
    const s = history.undo();
    if (s !== null) { latest.current = s; restore(s); }
    sync();
  }, [flush, history, restore, sync]);
  const redo = useCallback(() => {
    flush();
    const s = history.redo();
    if (s !== null) { latest.current = s; restore(s); }
    sync();
  }, [flush, history, restore, sync]);

  const pending = serialized !== history.present;
  return { undo, redo, canUndo: counts.undo > 0 || pending, canRedo: counts.redo > 0 && !pending };
}

/** Full screen on an element, falling back to a fixed overlay when the Fullscreen API is unavailable or refused. */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const on = () => setNative(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [ref]);

  // The overlay fallback should not let the page scroll underneath it.
  useEffect(() => {
    if (!overlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [overlay]);

  const exit = useCallback(() => {
    if (overlay) setOverlay(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, [overlay]);

  const toggle = useCallback(() => {
    if (native || overlay) { exit(); return; }
    const el = ref.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setOverlay(true));
    else setOverlay(true);
  }, [native, overlay, exit, ref]);

  return { isFullscreen: native || overlay, overlay, toggle, exit };
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
/** Label for the platform's command modifier. */
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Canvas view preferences (snap, mini-map), remembered per canvas kind. */
export function useCanvasPrefs(kind: 'hld' | 'lld', defaults: { snap: boolean; minimap: boolean }) {
  const key = `canvas-prefs:${kind}`;
  const [prefs, setPrefs] = useState(() => ({ ...defaults, ...readJson<Partial<typeof defaults>>(key, {}) }));
  const set = useCallback((patch: Partial<typeof defaults>) => setPrefs(p => { const n = { ...p, ...patch }; writeJson(key, n); return n; }), [key]);
  return [prefs, set] as const;
}

export type KeyMap = Record<string, (e: KeyboardEvent) => void>;

/** "mod+shift+z" style combo for a keyboard event (mod = Ctrl on Windows/Linux, ⌘ on macOS). */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  // Shift is implied by symbols like "?", so it is only part of the combo for letters and named keys.
  if (e.shiftKey && (e.key.length > 1 || /^[a-z]$/i.test(e.key))) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

const isEditable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"], .monaco-editor');

/**
 * Keyboard shortcuts scoped to one canvas: they fire only while the canvas was the last thing
 * clicked or holds focus, and never while typing in a field (so Ctrl+Z there stays the browser's own).
 */
export function useCanvasKeys(ref: RefObject<HTMLElement | null>, keys: KeyMap) {
  const active = useRef(false);
  const map = useRef(keys);
  useEffect(() => { map.current = keys; });

  useEffect(() => {
    const down = (e: PointerEvent) => { active.current = !!ref.current && e.target instanceof Node && ref.current.contains(e.target); };
    const key = (e: KeyboardEvent) => {
      const el = ref.current;
      if (!el) return;
      const focused = document.activeElement instanceof Node && el.contains(document.activeElement);
      if (!active.current && !focused) return;
      if (isEditable(e.target)) return;
      const fn = map.current[comboOf(e)];
      if (fn) { e.preventDefault(); fn(e); }
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [ref]);
}
