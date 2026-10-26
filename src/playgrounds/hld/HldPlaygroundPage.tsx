import { useState } from 'react';
import { writeJson } from '../../lib/storage';
import HldPlayground from './HldPlayground';
import { HLD_TEMPLATES } from './templates';

const STORAGE_KEY = 'hld:playground:free';

/** Full-page HLD playground with starter templates. */
export default function HldPlaygroundPage() {
  const [version, setVersion] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const load = (id: string) => {
    const t = HLD_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    // Loading replaces the canvas; ask first so a learner does not lose their own design by accident.
    if (typeof window.confirm === 'function' && !window.confirm(`Replace the current canvas with “${t.title}”?`)) return;
    writeJson(STORAGE_KEY, t.graph);
    setTemplateId(id);
    setVersion((v) => v + 1);
  };

  const current = HLD_TEMPLATES.find((t) => t.id === templateId);

  return (
    <div className="flex h-full min-h-screen flex-col gap-3 bg-bg p-4 text-ink">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">Architecture playground</h1>
          <p className="text-xs text-ink-2">
            Sketch a high-level design, connect components with sync or async calls, and get an automated review.
            Your work is saved in this browser.
          </p>
        </div>
        <div role="group" aria-label="Starter templates" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-3">Start from:</span>
          {HLD_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.description}
              onClick={() => load(t.id)}
              aria-pressed={templateId === t.id}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                templateId === t.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink hover:bg-surface-2'
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-[600px] flex-1">
        <HldPlayground
          key={version}
          storageKey={STORAGE_KEY}
          initial={current?.graph}
          title={current ? `Architecture playground — ${current.title}` : 'Architecture playground'}
          fullHeight
        />
      </div>
    </div>
  );
}
