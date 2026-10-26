import { useId, useState, type ReactNode } from 'react';
import { NodeIcon } from './icons';
import { compareGraphs, trafficSummary } from './analysis';
import { SEVERITY_LABEL } from './validate';
import { NODE_META, type HldEdgeKind, type HldFinding, type HldGraph, type HldNodeType, type HldPropValue } from './types';

export const btn =
  'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none';
export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50';
const input = 'w-full rounded-md border border-line bg-bg px-2 py-1 text-xs text-ink placeholder:text-ink-3';

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{children}</h3>;
}

// ---------- Inspector ----------

type PropKind = 'number' | 'boolean' | 'string';
interface PropField {
  key: string;
  label: string;
  kind: PropKind;
  hint: string;
  types?: HldNodeType[];
}

const PROP_FIELDS: PropField[] = [
  { key: 'instances', label: 'Instances', kind: 'number', hint: 'Copies running behind one name' },
  { key: 'replicas', label: 'Replicas', kind: 'number', hint: 'Data copies (including primary)' },
  { key: 'multiAz', label: 'Multi-AZ', kind: 'boolean', hint: 'Spread across availability zones' },
  { key: 'region', label: 'Region', kind: 'string', hint: 'e.g. ap-south-1' },
  { key: 'latencyMs', label: 'Latency (ms)', kind: 'number', hint: 'Time added per hop' },
  { key: 'ttlSeconds', label: 'TTL (s)', kind: 'number', hint: 'How long entries stay cached', types: ['cache', 'cdn'] },
  { key: 'rps', label: 'Requests / s', kind: 'number', hint: 'Traffic this client sends', types: ['client'] },
  { key: 'stateful', label: 'Keeps session state', kind: 'boolean', hint: 'Stores user sessions in memory', types: ['app-server'] },
  { key: 'sharedSession', label: 'Shared session store', kind: 'boolean', hint: 'Sessions live in Redis/DB', types: ['app-server'] },
  { key: 'sticky', label: 'Sticky sessions', kind: 'boolean', hint: 'Same user → same instance', types: ['load-balancer'] },
  { key: 'dlq', label: 'Has dead-letter queue', kind: 'boolean', hint: 'Failed messages are parked', types: ['queue'] },
];

export interface NodeSelection {
  kind: 'node';
  id: string;
  type: HldNodeType;
  label: string;
  props: Record<string, HldPropValue>;
}
export interface EdgeSelection {
  kind: 'edge';
  id: string;
  fromLabel: string;
  toLabel: string;
  edgeKind: HldEdgeKind;
  label: string;
}

export function Inspector(props: {
  selection: NodeSelection | EdgeSelection | null;
  onNodeChange: (id: string, patch: { label?: string; props?: Record<string, HldPropValue> }) => void;
  onEdgeChange: (id: string, patch: { kind?: HldEdgeKind; label?: string }) => void;
  onDelete: (kind: 'node' | 'edge', id: string) => void;
}) {
  const uid = useId();
  const { selection: s } = props;
  if (!s) {
    return (
      <p className="text-xs leading-relaxed text-ink-2">
        Select a component or connection on the canvas to edit it. Drag from a component’s right handle to another
        component’s left handle to connect them. Press <kbd className="rounded border border-line px-1">Delete</kbd> to
        remove the selection.
      </p>
    );
  }
  if (s.kind === 'edge') {
    return (
      <div className="space-y-3">
        <div className="text-xs text-ink-2">
          Connection <span className="font-medium text-ink">{s.fromLabel}</span> →{' '}
          <span className="font-medium text-ink">{s.toLabel}</span>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-ink">Call style</legend>
          <div className="inline-flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Call style">
            {(['sync', 'async'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={s.edgeKind === k}
                onClick={() => props.onEdgeChange(s.id, { kind: k })}
                className={`rounded px-3 py-1 text-xs ${s.edgeKind === k ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}
              >
                {k === 'sync' ? 'Sync (waits)' : 'Async (fire & forget)'}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
            Sync: the caller waits for the answer. Async: the caller hands work off (drawn dashed) and moves on.
          </p>
        </fieldset>
        <label className="block text-xs font-medium text-ink" htmlFor={`${uid}-elabel`}>
          Label
        </label>
        <input
          id={`${uid}-elabel`}
          className={input}
          value={s.label}
          placeholder="e.g. SQL, HTTPS, publish"
          onChange={(e) => props.onEdgeChange(s.id, { label: e.target.value })}
        />
        <button type="button" className={`${btn} text-bad`} onClick={() => props.onDelete('edge', s.id)}>
          Delete connection
        </button>
      </div>
    );
  }
  const meta = NODE_META[s.type];
  const fields = PROP_FIELDS.filter((f) => !f.types || f.types.includes(s.type));
  const setProp = (key: string, value: HldPropValue | undefined) => {
    const next = { ...s.props };
    if (value === undefined || value === '' || value === false) delete next[key];
    else next[key] = value;
    props.onNodeChange(s.id, { props: next });
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
          <NodeIcon type={s.type} size={16} />
        </span>
        <div>
          <div className="text-xs font-medium text-ink">{meta.label}</div>
          <div className="text-[11px] text-ink-3">{meta.description}</div>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink" htmlFor={`${uid}-label`}>
          Label
        </label>
        <input
          id={`${uid}-label`}
          className={input}
          value={s.label}
          onChange={(e) => props.onNodeChange(s.id, { label: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => {
          const id = `${uid}-${f.key}`;
          const v = s.props[f.key];
          if (f.kind === 'boolean') {
            return (
              <label key={f.key} htmlFor={id} className="col-span-2 flex items-start gap-2 text-xs text-ink" title={f.hint}>
                <input
                  id={id}
                  type="checkbox"
                  className="mt-0.5 accent-[var(--color-accent)]"
                  checked={v === true}
                  onChange={(e) => setProp(f.key, e.target.checked)}
                />
                <span>
                  {f.label}
                  <span className="block text-[11px] text-ink-3">{f.hint}</span>
                </span>
              </label>
            );
          }
          return (
            <div key={f.key}>
              <label htmlFor={id} className="mb-0.5 block text-[11px] text-ink-2" title={f.hint}>
                {f.label}
              </label>
              <input
                id={id}
                className={input}
                type={f.kind === 'number' ? 'number' : 'text'}
                min={f.kind === 'number' ? 0 : undefined}
                value={v === undefined ? '' : String(v)}
                placeholder={f.key === 'latencyMs' ? `${meta.latencyMs} (default)` : f.hint}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (f.kind === 'number') {
                    const n = Number(raw);
                    setProp(f.key, raw === '' || !Number.isFinite(n) ? undefined : n);
                  } else setProp(f.key, raw);
                }}
              />
            </div>
          );
        })}
      </div>
      <button type="button" className={`${btn} text-bad`} onClick={() => props.onDelete('node', s.id)}>
        Delete component
      </button>
    </div>
  );
}

// ---------- Findings ----------

const SEV_STYLE: Record<HldFinding['severity'], string> = {
  error: 'bg-bad-soft text-bad',
  warning: 'bg-warn-soft text-warn',
  tradeoff: 'bg-accent-soft text-accent',
  info: 'bg-surface-2 text-ink-2',
};
const SEV_ORDER: HldFinding['severity'][] = ['error', 'warning', 'tradeoff', 'info'];

export function FindingsPanel({
  findings,
  activeId,
  onActivate,
}: {
  findings: HldFinding[];
  activeId: string | null;
  onActivate: (f: HldFinding | null) => void;
}) {
  const counts = SEV_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length] as const);
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-ink-3">
        Automated review. <strong className="text-bad">Definite problems</strong> break a widely accepted rule.{' '}
        <strong className="text-warn">Risks</strong> are likely to hurt. <strong className="text-accent">Trade-offs</strong>{' '}
        are valid choices with a cost. <strong className="text-ink-2">Consider</strong> items are suggestions. The checker
        only knows simple rules — a design can pass and still not fit the requirements.
      </p>
      <div className="flex flex-wrap gap-1.5" aria-label="Finding counts">
        {counts.map(([s, c]) => (
          <span key={s} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SEV_STYLE[s]}`}>
            {SEVERITY_LABEL[s]}: {c}
          </span>
        ))}
      </div>
      {findings.length === 0 ? (
        <p className="rounded-md bg-ok-soft p-2 text-xs text-ok">No findings from the automated rules.</p>
      ) : (
        <ul className="space-y-2">
          {[...findings]
            .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
            .map((f) => {
              const active = f.id === activeId;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onActivate(active ? null : f)}
                    className={`w-full rounded-md border p-2 text-left ${active ? 'border-accent bg-surface-2' : 'border-line hover:bg-surface-2'}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEV_STYLE[f.severity]}`}>
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                      <span className="text-xs font-medium text-ink">{f.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{f.detail}</p>
                    {f.nodeIds.length > 0 && (
                      <span className="mt-1 block text-[10px] text-ink-3">
                        {active ? 'Highlighted on canvas — click again to clear' : 'Click to highlight on canvas'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

// ---------- Traffic summary ----------

export function SummaryPanel({ graph }: { graph: HldGraph }) {
  const t = trafficSummary(graph);
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Client traffic" value={`${t.clientRps.toLocaleString()} rps`} />
        <Stat label="Slowest sync path" value={`${t.totalLatencyMs} ms`} />
      </div>
      {t.path.length > 1 ? (
        <div>
          <SectionTitle>Longest synchronous path ({t.hops} hops)</SectionTitle>
          <ol className="space-y-1">
            {t.path.map((p, i) => (
              <li key={p.id + i} className="flex justify-between gap-2 rounded bg-surface-2 px-2 py-1">
                <span className="truncate text-ink">
                  {i + 1}. {p.label}
                </span>
                <span className="shrink-0 tabular-nums text-ink-2">+{p.latencyMs} ms</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-ink-2">Add a client and connect it with sync edges to see the request path.</p>
      )}
      <p className="text-[11px] leading-relaxed text-ink-3">
        Latencies are illustrative defaults per component type (for example app server 20 ms, database 10 ms, external
        API 150 ms), not measurements. Override them with each component’s “Latency (ms)” field. Async edges are left out
        because the caller does not wait for them.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

// ---------- Compare ----------

export function ComparePanel({ graph, reference }: { graph: HldGraph; reference: HldGraph }) {
  const c = compareGraphs(graph, reference);
  const none = !c.missingTypes.length && !c.extraTypes.length && !c.missingEdges.length && !c.extraEdges.length;
  const typeName = (t: HldNodeType) => NODE_META[t].label;
  return (
    <div className="space-y-3 text-xs">
      <p className="text-[11px] leading-relaxed text-ink-3">
        Differences between your design and one reference design. There are many valid designs — a difference is a
        prompt to explain your choice, not a mistake.
      </p>
      {none && <p className="rounded-md bg-ok-soft p-2 text-ok">Same component types and connections as the reference.</p>}
      <DiffList title="Components in both" items={c.sharedTypes.map(typeName)} tone="ok" />
      <DiffList title="In the reference, not in yours" items={c.missingTypes.map((d) => typeName(d.type))} tone="warn" />
      <DiffList title="In yours, not in the reference" items={c.extraTypes.map((d) => typeName(d.type))} tone="neutral" />
      <DiffList title="Connections only in the reference" items={c.missingEdges} tone="warn" />
      <DiffList title="Connections only in yours" items={c.extraEdges} tone="neutral" />
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: 'ok' | 'warn' | 'neutral' }) {
  if (!items.length) return null;
  const cls = tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2';
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <ul className="flex flex-wrap gap-1">
        {items.map((i) => (
          <li key={i} className={`rounded px-1.5 py-0.5 text-[11px] ${cls}`}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Export / import ----------

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <button
      type="button"
      className={btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('done');
        } catch {
          setState('fail');
        }
        setTimeout(() => setState('idle'), 1500);
      }}
    >
      {state === 'done' ? 'Copied' : state === 'fail' ? 'Copy failed — select the text' : label}
    </button>
  );
}

export function ExportPanel(props: { json: string; mermaid: string; onImport: (text: string) => string | null }) {
  const uid = useId();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const download = () => {
    const url = URL.createObjectURL(new Blob([props.json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hld-design.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const doImport = (raw: string) => {
    const err = props.onImport(raw);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Design imported.' });
    if (!err) setText('');
  };
  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${uid}-json`} className="font-medium text-ink">
            JSON
          </label>
          <div className="flex gap-1">
            <CopyButton text={props.json} />
            <button type="button" className={btn} onClick={download}>
              Download
            </button>
          </div>
        </div>
        <textarea id={`${uid}-json`} readOnly value={props.json} rows={6} className={`${input} font-mono text-[11px]`} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${uid}-mmd`} className="font-medium text-ink">
            Mermaid flowchart
          </label>
          <CopyButton text={props.mermaid} />
        </div>
        <textarea id={`${uid}-mmd`} readOnly value={props.mermaid} rows={6} className={`${input} font-mono text-[11px]`} />
      </div>
      <div>
        <label htmlFor={`${uid}-imp`} className="mb-1 block font-medium text-ink">
          Import JSON
        </label>
        <textarea
          id={`${uid}-imp`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder='{"nodes": [...], "edges": [...]}'
          className={`${input} font-mono text-[11px]`}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={!text.trim()} onClick={() => doImport(text)}>
            Replace canvas
          </button>
          <label className={`${btn} cursor-pointer`}>
            Open file…
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) doImport(await f.text());
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {msg && (
          <p role="status" className={`mt-1 ${msg.ok ? 'text-ok' : 'text-bad'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
