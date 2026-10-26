import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import http from 'highlight.js/lib/languages/http';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import plaintext from 'highlight.js/lib/languages/plaintext';
import protobuf from 'highlight.js/lib/languages/protobuf';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';
import Mermaid from './Mermaid';
import { cx } from './ui';
import { parseAttrs } from '../lib/lessonParser';

hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('http', http);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('protobuf', protobuf);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('powershell', powershell);
const ALIASES: Record<string, string> = { cs: 'csharp', 'c#': 'csharp', sh: 'bash', shell: 'bash', yml: 'yaml', ts: 'typescript', js: 'javascript', html: 'xml', csproj: 'xml', toml: 'ini', text: 'plaintext', txt: 'plaintext', proto: 'protobuf', ps1: 'powershell', psql: 'sql', pgsql: 'sql', postgresql: 'sql', tsx: 'typescript', jsx: 'javascript', docker: 'dockerfile' };

export function highlight(code: string, lang: string): string {
  const l = ALIASES[lang] ?? lang;
  try {
    if (hljs.getLanguage(l)) return hljs.highlight(code, { language: l, ignoreIllegals: true }).value;
  } catch { /* fall through */ }
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function CodeBlock({ code, lang, title, className, actions }: { code: string; lang: string; title?: string; className?: string; actions?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className={cx('not-prose my-4 overflow-hidden rounded-lg border border-line bg-surface-2', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="truncate font-mono text-xs text-ink-3">{title ?? (lang && lang !== 'plaintext' ? lang : 'code')}</span>
        <div className="flex items-center gap-2">
          {actions}
          <button onClick={copy} className="text-xs text-ink-3 hover:text-ink" aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <pre className="hljs overflow-x-auto p-3 text-[13px] leading-relaxed"><code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} /></pre>
    </div>
  );
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, node }) => {
    const text = String(children ?? '');
    const m = /language-([\w#+-]+)/.exec(className ?? '');
    const meta = (node as unknown as { data?: { meta?: string } })?.data?.meta ?? '';
    const isBlock = !!m || text.includes('\n');
    if (!isBlock) return <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.88em] text-ink before:content-none after:content-none">{children}</code>;
    const lang = (m?.[1] ?? 'plaintext').toLowerCase();
    const code = text.replace(/\n$/, '');
    if (lang === 'mermaid') return <Mermaid source={code} />;
    const attrs = parseAttrs(meta);
    return <CodeBlock code={code} lang={lang} title={attrs.file ?? attrs.title} />;
  },
  a: ({ href, children }) => {
    if (href?.startsWith('#/')) return <a href={href} className="text-accent">{children}</a>;
    if (href?.startsWith('#')) return <a href={href} onClick={e => { e.preventDefault(); scrollToId(href.slice(1)); }} className="text-accent">{children}</a>;
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent">{children}</a>;
  },
  table: ({ children }) => <div className="not-prose my-4 overflow-x-auto rounded-lg border border-line"><table className="md-table w-full border-collapse text-sm">{children}</table></div>,
  input: ({ checked, type }) => type === 'checkbox' ? <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle accent-[var(--color-accent)]" /> : null,
};

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx('prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
    </div>
  );
});
