// Full-page LLD designer with starter templates.
import { useState } from 'react';
import { readJson, writeJson } from '../../lib/storage';
import LldPlayground from './LldPlayground';
import { LLD_TEMPLATES } from './templates';

const SELECTED_KEY = 'lld:page:template';

export default function LldPlaygroundPage() {
  const [templateId, setTemplateId] = useState<string>(() => {
    const saved = readJson<string>(SELECTED_KEY, 'strategy');
    return LLD_TEMPLATES.some((t) => t.id === saved) ? saved : 'strategy';
  });
  const template = LLD_TEMPLATES.find((t) => t.id === templateId) ?? LLD_TEMPLATES[0];
  const choose = (id: string) => { setTemplateId(id); writeJson(SELECTED_KEY, id); };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 text-ink">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">LLD design playground</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Sketch classes like on a whiteboard, then let the playground turn the sketch into a class diagram (Mermaid), C# skeletons and a
          design review. Each template keeps its own saved copy in this browser, so switching templates never loses work.
        </p>
      </header>
      <nav aria-label="Starter templates" className="mb-4 flex flex-wrap gap-2">
        {LLD_TEMPLATES.map((t) => (
          <button key={t.id} type="button" aria-pressed={t.id === template.id} onClick={() => choose(t.id)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${t.id === template.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'}`}>
            <span className="block font-medium">{t.title}</span>
            <span className="block text-xs text-ink-3">{t.description}</span>
          </button>
        ))}
      </nav>
      <LldPlayground key={template.id} initial={template.model} storageKey={`lld:page:${template.id}`} title={template.title} />
    </div>
  );
}
