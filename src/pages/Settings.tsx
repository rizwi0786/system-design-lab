import { useEffect, useRef, useState } from 'react';
import { actions } from '../lib/progress';
import { updateSettings, useSettings, type Theme } from '../lib/settings';
import { storageAvailable } from '../lib/storage';
import { downloadBlob } from '../lib/projectZip';
import { exportAll, importAll, markExported, parseBackup, getBackupMeta, requestPersistentStorage, storageEstimate } from '../lib/backup';
import { Button, Card, PageHeader, cx } from '../components/ui';

function fmtBytes(n: number) { return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }

export default function Settings() {
  const s = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<{ name: string; json: unknown; count: number; format: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [meta, setMeta] = useState(getBackupMeta());
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestPersistentStorage().then(p => { setPersisted(p); setMeta(getBackupMeta()); });
    storageEstimate().then(setEstimate);
  }, []);

  const backupSize = () => { try { return new Blob([JSON.stringify(exportAll())]).size; } catch { return 0; } };

  const exportJson = () => {
    const data = exportAll();
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `system-design-lab-backup-${data.exportedAt.slice(0, 10)}.json`);
    markExported();
    setMeta(getBackupMeta());
    setMsg({ ok: true, text: `Backup exported (${Object.keys(data.keys).length} records). Keep the file somewhere safe — it restores everything on any device.` });
  };

  const chooseFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      const p = parseBackup(json);
      setPending({ name: f.name, json, count: p.count, format: p.format });
      setMsg(null);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  const doImport = (mode: 'replace' | 'merge') => {
    if (!pending) return;
    try {
      const n = importAll(pending.json, mode);
      setPending(null);
      setMsg({ ok: true, text: `Restored ${n} records (${mode}). Reloading…` });
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Card title="Appearance">
          <fieldset className="flex flex-wrap gap-2"><legend className="mb-2 text-sm text-ink-2">Theme</legend>
            {(['light', 'dark', 'system'] as Theme[]).map(t => <button key={t} onClick={() => updateSettings({ theme: t })} aria-pressed={s.theme === t} className={cx('rounded-md border px-3 py-1.5 text-sm capitalize', s.theme === t ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2')}>{t}</button>)}
          </fieldset>
          <label className="mt-4 flex flex-col gap-1 text-sm text-ink-2">Reading text size: {Math.round(s.fontScale * 100)}%
            <input type="range" min={0.85} max={1.3} step={0.05} value={s.fontScale} onChange={e => updateSettings({ fontScale: Number(e.target.value) })} className="max-w-xs accent-[var(--color-accent)]" /></label>
        </Card>

        <Card title="Your data: backup and restore">
          <p className="text-sm text-ink-2">
            Everything you do here — lesson progress, quiz attempts, exercise answers and code edits, notes, bookmarks,
            flashcard schedules, saved architecture and class designs, API contracts and SQL history — is stored in this
            browser only, on this device. There is no account and nothing is sent to a server. It stays until you clear the
            site's data or reset it below, so export a backup regularly and keep it with your own files.
          </p>
          {!storageAvailable() && <p className="mt-2 rounded-md bg-bad-soft p-2 text-sm text-bad">Browser storage is unavailable right now (private window or blocked site data). Your work is kept in memory only and will be lost when this tab closes — export before leaving.</p>}

          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2"><dt className="text-ink-3">Last backup exported</dt><dd>{meta.lastExportAt ? new Date(meta.lastExportAt).toLocaleString() : 'never'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-3">Last restore</dt><dd>{meta.lastImportAt ? new Date(meta.lastImportAt).toLocaleString() : '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-3">Backup size</dt><dd>{fmtBytes(backupSize())}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-3">Protected from eviction</dt>
              <dd title="navigator.storage.persist(): asks the browser never to clear this site's data to free space.">
                {persisted === null ? 'not supported here' : persisted ? 'yes (persistent storage granted)' : 'no — browser declined; a backup file is your safety net'}
              </dd></div>
            {estimate && estimate.quota > 0 && <div className="flex justify-between gap-2"><dt className="text-ink-3">Browser storage used</dt><dd>{fmtBytes(estimate.usage)} of {fmtBytes(estimate.quota)}</dd></div>}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={exportJson}>Export full backup (JSON)</Button>
            <Button onClick={() => file.current?.click()}>Restore from backup…</Button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) chooseFile(f); e.target.value = ''; }} />
          </div>

          {pending && (
            <div className="mt-3 rounded-md border border-line bg-surface-2 p-3 text-sm" role="dialog" aria-label="Confirm restore">
              <p><strong>{pending.name}</strong> contains {pending.count} record{pending.count === 1 ? '' : 's'}{pending.format === 1 ? ' (older progress-only format)' : ''}. How do you want to restore it?</p>
              <ul className="mt-2 list-disc pl-5 text-ink-2">
                <li><strong>Replace</strong> — wipe everything in this browser first, then load the file. Use this to move to a new device.</li>
                <li><strong>Merge</strong> — keep what is here and overwrite only the records present in the file.</li>
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button onClick={() => doImport('replace')}>Replace</Button>
                <Button variant="ghost" onClick={() => doImport('merge')}>Merge</Button>
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {msg && <p className={cx('mt-2 text-sm', msg.ok ? 'text-ok' : 'text-bad')} role="status">{msg.text}</p>}

          <div className="mt-6 border-t border-line pt-4">
            {!confirmReset ? <Button variant="ghost" onClick={() => setConfirmReset(true)}>Reset all progress…</Button> : (
              <div className="rounded-md bg-bad-soft p-3 text-sm text-bad" role="alertdialog" aria-label="Confirm reset">
                This permanently deletes all learning progress in this browser. Export a backup first if you might want it back.
                <div className="mt-2 flex gap-2"><Button variant="danger" onClick={() => { actions.reset(); setConfirmReset(false); setMsg({ ok: true, text: 'All progress was reset.' }); }}>Yes, delete everything</Button><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
