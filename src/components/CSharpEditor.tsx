import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import '../lib/monacoSetup';
import type { CodeFile } from '../lib/lessonParser';
import { useSettings, isDark } from '../lib/settings';
import { readJson, writeJson, removeKey } from '../lib/storage';
import { buildProjectZip, downloadBlob } from '../lib/projectZip';
import { Button, cx } from './ui';

export interface CSharpEditorProps {
  storageKey: string;
  files: CodeFile[];
  tests?: CodeFile[];
  title: string;
  exerciseId: string;
  lessonId: string;
  description?: string;
  acceptance?: string[];
  height?: number;
  onChange?: (files: Record<string, string>) => void;
}

/** Monaco-based multi-file C# editor. Saves edits per storageKey and exports a runnable dotnet project.
 * It does NOT compile or execute C# — that happens on the learner's machine via the downloaded project. */
export default function CSharpEditor({ storageKey, files, tests = [], title, exerciseId, lessonId, description, acceptance, height = 420, onChange }: CSharpEditorProps) {
  const settings = useSettings();
  const initial = () => Object.fromEntries(files.map(f => [f.name, f.code]));
  const [code, setCode] = useState<Record<string, string>>(() => ({ ...initial(), ...readJson<Record<string, string>>(`code:${storageKey}`, {}) }));
  const allTabs = [...files.map(f => ({ name: f.name, readOnly: false })), ...tests.map(t => ({ name: t.name, readOnly: true }))];
  const [active, setActive] = useState(allTabs[0]?.name ?? '');
  const [busy, setBusy] = useState(false);
  const isTest = tests.some(t => t.name === active);
  const value = isTest ? tests.find(t => t.name === active)?.code ?? '' : code[active] ?? '';

  useEffect(() => { onChange?.(code); }, [code, onChange]);

  const update = (v: string | undefined) => {
    if (isTest) return;
    const next = { ...code, [active]: v ?? '' };
    setCode(next);
    writeJson(`code:${storageKey}`, next);
  };
  const reset = () => { removeKey(`code:${storageKey}`); setCode(initial()); };
  const download = async () => {
    setBusy(true);
    try {
      const blob = await buildProjectZip({ title, exerciseId, lessonId, description, acceptance, files: files.map(f => ({ ...f, code: code[f.name] ?? f.code })), tests });
      downloadBlob(blob, `${exerciseId}.zip`);
    } finally { setBusy(false); }
  };
  const edited = files.some(f => (code[f.name] ?? f.code) !== f.code);

  return (
    <div className="not-prose overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-2 py-1">
        <div className="flex min-w-0 flex-wrap gap-1" role="tablist">
          {allTabs.map(t => (
            <button key={t.name} role="tab" aria-selected={active === t.name} onClick={() => setActive(t.name)}
              className={cx('rounded px-2 py-1 font-mono text-xs', active === t.name ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>
              {t.name}{t.readOnly && <span className="ml-1 text-[10px] text-ink-3">(tests, read-only)</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={reset} disabled={!edited} title="Restore the starter code">Reset</Button>
          <Button size="sm" variant="primary" onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download .NET project'}</Button>
        </div>
      </div>
      <Editor
        height={height}
        language="csharp"
        theme={isDark(settings.theme) ? 'vs-dark' : 'vs'}
        value={value}
        onChange={update}
        options={{ minimap: { enabled: false }, fontSize: 13, readOnly: isTest, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4, wordWrap: 'on' }}
        loading={<div className="p-4 text-sm text-ink-3">Loading editor…</div>}
      />
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
        C# is compiled and run on your machine with the .NET 10 SDK; this site does not execute C#. Your edits are saved in this browser.
        Download the project, then run <code className="font-mono">dotnet test tests/App.Tests</code>.
      </p>
    </div>
  );
}
