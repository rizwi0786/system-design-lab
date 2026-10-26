import { useEffect, useId, useState } from 'react';
import { useSettings, isDark } from '../lib/settings';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let initialisedFor: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getMermaid(dark: boolean) {
  mermaidPromise ??= import('mermaid').then(m => m.default);
  const mermaid = await mermaidPromise;
  const key = dark ? 'dark' : 'light';
  if (initialisedFor !== key) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      flowchart: { htmlLabels: true, curve: 'basis' },
      themeVariables: dark ? { background: '#1b1b19', primaryColor: '#242421', primaryTextColor: '#ecece8', lineColor: '#85857d' } : {},
    });
    initialisedFor = key;
  }
  return mermaid;
}

/** Renders Mermaid source. Errors are shown as readable text next to the source; the page never crashes. */
export default function Mermaid({ source, caption }: { source: string; caption?: string }) {
  const settings = useSettings();
  const dark = isDark(settings.theme);
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Mermaid rendering is global-state heavy; serialise renders to avoid id collisions.
    queue = queue.then(async () => {
      try {
        const mermaid = await getMermaid(dark);
        const { svg } = await mermaid.render(`mmd-${rid}-${dark ? 'd' : 'l'}`, source.trim());
        if (!cancelled) { setSvg(svg); setError(null); }
      } catch (e) {
        if (!cancelled) { setError((e as Error).message ?? String(e)); setSvg(null); }
        document.getElementById(`dmmd-${rid}-${dark ? 'd' : 'l'}`)?.remove();
      }
    });
    return () => { cancelled = true; };
  }, [source, dark, rid]);

  return (
    <figure className="not-prose my-5 rounded-lg border border-line bg-surface">
      <div className="overflow-x-auto p-3">
        {svg && <div className="mermaid-svg flex justify-center [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
        {!svg && !error && <div className="p-6 text-center text-sm text-ink-3">Rendering diagram…</div>}
        {error && (
          <div className="rounded-md bg-warn-soft p-3 text-sm text-warn">
            <strong>This diagram could not be rendered.</strong> The source is shown below so you can still read it.
            <div className="mt-1 font-mono text-xs opacity-80">{error.split('\n')[0]}</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5">
        <span className="text-xs text-ink-3">{caption ?? 'Diagram'}</span>
        <button className="text-xs text-accent hover:underline" onClick={() => setShowSource(s => !s)} aria-expanded={showSource || !!error}>
          {showSource || error ? 'Hide source' : 'View source'}
        </button>
      </div>
      {(showSource || error) && <pre className="overflow-x-auto border-t border-line bg-surface-2 p-3 text-xs text-ink-2"><code>{source}</code></pre>}
    </figure>
  );
}
