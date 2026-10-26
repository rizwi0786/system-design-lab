// Renders Mermaid source with the `mermaid` package (lazy-loaded). Re-renders when the theme (.dark on <html>) changes.
import { useEffect, useId, useState } from 'react';
import { useIsDark } from './useIsDark';

let queue: Promise<unknown> = Promise.resolve();

export default function MermaidView({ source, className = '', label = 'Diagram' }: { source: string; className?: string; label?: string }) {
  const dark = useIsDark();
  const rawId = useId();
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = 'mmd' + rawId.replace(/[^\w]/g, '') + Math.random().toString(36).slice(2, 8);
    // mermaid.initialize is global, so renders are serialised to keep each one's theme.
    queue = queue.then(async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' });
        const out = await mermaid.render(id, source);
        if (!cancelled) { setSvg(out.svg); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        document.getElementById('d' + id)?.remove();
      }
    });
    return () => { cancelled = true; };
  }, [source, dark, rawId]);

  if (error) {
    return (
      <div className={`rounded-md border border-line bg-bad-soft p-3 text-sm text-bad ${className}`} role="alert">
        <p className="font-medium">Mermaid could not render this diagram</p>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{error}</pre>
      </div>
    );
  }
  if (!svg) return <div className={`p-4 text-sm text-ink-3 ${className}`}>Rendering diagram…</div>;
  return (
    <div role="img" aria-label={label} className={`overflow-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
