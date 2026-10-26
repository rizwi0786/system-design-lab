// Full backup / restore of everything the app keeps in this browser:
// progress, settings, notes, bookmarks, flashcard schedules, code edits, saved HLD/LLD/API designs, SQL history.
// All of it lives under the "sdlp:" localStorage prefix, so a backup is simply every key under that prefix.
import { allKeys, readJson, writeJson, removeKey } from './storage';

export const BACKUP_FORMAT = 2;
export const BACKUP_META_KEY = 'backup:meta';

export interface BackupFile {
  app: 'system-design-lab';
  format: number;
  exportedAt: string;
  keys: Record<string, unknown>;
}
export interface BackupMeta { lastExportAt?: string; lastImportAt?: string; persisted?: boolean }

export function getBackupMeta(): BackupMeta { return readJson<BackupMeta>(BACKUP_META_KEY, {}); }
function setBackupMeta(patch: Partial<BackupMeta>) { writeJson(BACKUP_META_KEY, { ...getBackupMeta(), ...patch }); }

/** Snapshot every app key. Pure data: safe to JSON.stringify. */
export function exportAll(): BackupFile {
  const keys: Record<string, unknown> = {};
  for (const k of allKeys()) {
    if (k === BACKUP_META_KEY) continue;
    const v = readJson<unknown>(k, undefined);
    if (v !== undefined) keys[k] = v;
  }
  return { app: 'system-design-lab', format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), keys };
}

export function markExported() { setBackupMeta({ lastExportAt: new Date().toISOString() }); }

/** Accepts a format-2 full backup or a format-1 progress-only export ({ progress: {...} } or a bare progress object). */
export function parseBackup(json: unknown): { keys: Record<string, unknown>; count: number; format: number } {
  if (!json || typeof json !== 'object') throw new Error('Not a JSON object.');
  const o = json as Record<string, unknown>;
  if (o.app === 'system-design-lab' && o.keys && typeof o.keys === 'object') {
    const keys = o.keys as Record<string, unknown>;
    return { keys, count: Object.keys(keys).length, format: Number(o.format ?? 2) };
  }
  const prog = (o.progress ?? o) as Record<string, unknown>;
  if (prog && typeof prog === 'object' && ('quiz' in prog || 'visits' in prog || 'exercises' in prog)) {
    return { keys: { progress: prog }, count: 1, format: 1 };
  }
  throw new Error('This file does not look like a System Design Lab backup.');
}

/** Restore. mode "replace" clears existing app data first; "merge" overwrites only keys present in the file. */
export function importAll(json: unknown, mode: 'replace' | 'merge' = 'replace'): number {
  const { keys } = parseBackup(json);
  if (mode === 'replace') for (const k of allKeys()) if (k !== BACKUP_META_KEY) removeKey(k);
  for (const [k, v] of Object.entries(keys)) writeJson(k, v);
  setBackupMeta({ lastImportAt: new Date().toISOString() });
  return Object.keys(keys).length;
}

/** Ask the browser to keep this site's storage even under storage pressure (Chrome/Firefox/Safari honour it in different ways). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    const already = await navigator.storage.persisted?.();
    const ok = already || (await navigator.storage.persist());
    setBackupMeta({ persisted: ok });
    return ok;
  } catch { return null; }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch { return null; }
}

/** Days since the last export, or null if never exported. */
export function daysSinceExport(now = Date.now()): number | null {
  const m = getBackupMeta();
  if (!m.lastExportAt) return null;
  return Math.floor((now - Date.parse(m.lastExportAt)) / 86_400_000);
}
