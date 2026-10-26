import { describe, it, expect, beforeEach } from 'vitest';
import { writeJson, readJson, allKeys, removeKey } from '../storage';
import { exportAll, importAll, parseBackup, markExported, daysSinceExport } from '../backup';

describe('backup', () => {
  beforeEach(() => { for (const k of allKeys()) removeKey(k); });

  it('exports every app key and restores it (replace)', () => {
    writeJson('progress', { quiz: { a: 1 } });
    writeJson('hld:design-1', { nodes: [], edges: [] });
    writeJson('code:ex1', { 'Program.cs': 'x' });
    const file = exportAll();
    expect(file.app).toBe('system-design-lab');
    expect(Object.keys(file.keys).sort()).toEqual(['code:ex1', 'hld:design-1', 'progress']);
    for (const k of allKeys()) removeKey(k);
    writeJson('junk', 1);
    const n = importAll(JSON.parse(JSON.stringify(file)), 'replace');
    expect(n).toBe(3);
    expect(readJson('junk', null)).toBeNull();
    expect(readJson('hld:design-1', null)).toEqual({ nodes: [], edges: [] });
  });

  it('merge keeps existing keys', () => {
    writeJson('settings', { theme: 'dark' });
    importAll({ app: 'system-design-lab', format: 2, exportedAt: 'x', keys: { progress: { visits: {} } } }, 'merge');
    expect(readJson('settings', null)).toEqual({ theme: 'dark' });
    expect(readJson('progress', null)).toEqual({ visits: {} });
  });

  it('accepts the old progress-only format', () => {
    const p = parseBackup({ app: 'system-design-lab', progress: { quiz: {}, visits: {} } });
    expect(p.format).toBe(1);
    expect(p.keys.progress).toBeTruthy();
  });

  it('rejects unrelated files', () => {
    expect(() => parseBackup({ hello: 'world' })).toThrow(/backup/);
  });

  it('tracks days since export', () => {
    expect(daysSinceExport()).toBeNull();
    markExported();
    expect(daysSinceExport()).toBe(0);
  });
});
