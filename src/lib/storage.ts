// Safe wrappers around localStorage. Storage can be missing or throw (private mode, blocked site data,
// previews), so every call is guarded and the app keeps working in memory.
const memory = new Map<string, string>();
const PREFIX = 'sdlp:';

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    const k = PREFIX + '__probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

let cached: Storage | null | undefined;
function store(): Storage | null {
  if (cached === undefined) cached = typeof window === 'undefined' ? null : ls();
  return cached;
}

export function readJson<T>(key: string, fallback: T): T {
  const k = PREFIX + key;
  try {
    const raw = store()?.getItem(k) ?? memory.get(k) ?? null;
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  memory.set(k, raw);
  try { store()?.setItem(k, raw); } catch { /* quota or blocked: memory copy still works this session */ }
}

export function removeKey(key: string): void {
  const k = PREFIX + key;
  memory.delete(k);
  try { store()?.removeItem(k); } catch { /* ignore */ }
}

/** All keys owned by the app (without prefix) — used by progress export. */
export function allKeys(): string[] {
  const keys = new Set<string>();
  for (const k of memory.keys()) if (k.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length));
  try {
    const s = store();
    if (s) for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length)); }
  } catch { /* ignore */ }
  keys.delete('__probe');
  return [...keys];
}

export const storageAvailable = () => store() !== null;
