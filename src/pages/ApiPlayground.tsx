import { useMemo, useState } from 'react';
import { compareContracts, lintContract, sampleContract, toOpenApi, toYaml, type ApiContract, type Endpoint, type FieldDef, type HttpMethod } from '../lib/apiLint';
import { readJson, writeJson } from '../lib/storage';
import { Badge, Button, Card, PageHeader, Tabs, cx } from '../components/ui';
import { CodeBlock } from '../components/Markdown';
import { downloadBlob } from '../lib/projectZip';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TYPES: FieldDef['type'][] = ['string', 'integer', 'number', 'boolean', 'object', 'array'];
const CODES = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503];
const newEndpoint = (): Endpoint => ({ id: `endpoint${Math.random().toString(36).slice(2, 6)}`, method: 'GET', path: '/items', summary: '', auth: 'bearer', request: [], response: [], statusCodes: [200], paginated: false, idempotencyKey: false, errorFormat: 'problem-details' });

function FieldsEditor({ fields, onChange, label }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void; label: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-xs font-semibold text-ink-2">{label}</legend>
      {fields.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <input aria-label="Field name" value={f.name} onChange={e => onChange(fields.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="w-32 rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-ink" />
          <select aria-label="Field type" value={f.type} onChange={e => onChange(fields.map((x, j) => j === i ? { ...x, type: e.target.value as FieldDef['type'] } : x))} className="rounded border border-line bg-surface px-1 py-1 text-xs text-ink">{TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <label className="flex items-center gap-1 text-xs text-ink-2"><input type="checkbox" checked={f.required} onChange={e => onChange(fields.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} />required</label>
          <button className="text-xs text-bad" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>Remove</button>
        </div>
      ))}
      <button className="text-xs text-accent" onClick={() => onChange([...fields, { name: 'field', type: 'string', required: false }])}>+ Add field</button>
    </fieldset>
  );
}

function EndpointEditor({ e, onChange, onRemove }: { e: Endpoint; onChange: (e: Endpoint) => void; onRemove: () => void }) {
  const set = <K extends keyof Endpoint>(k: K, v: Endpoint[K]) => onChange({ ...e, [k]: v });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label="HTTP method" value={e.method} onChange={x => set('method', x.target.value as HttpMethod)} className="rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink">{METHODS.map(m => <option key={m}>{m}</option>)}</select>
        <input aria-label="Path" value={e.path} onChange={x => set('path', x.target.value)} className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink" />
      </div>
      <input aria-label="Summary" value={e.summary} placeholder="Summary" onChange={x => set('summary', x.target.value)} className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-ink-2">Authentication
          <select value={e.auth} onChange={x => set('auth', x.target.value as Endpoint['auth'])} className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"><option value="none">None</option><option value="bearer">Bearer (JWT)</option><option value="cookie">Cookie</option><option value="api-key">API key</option></select></label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Error format
          <select value={e.errorFormat} onChange={x => set('errorFormat', x.target.value as Endpoint['errorFormat'])} className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"><option value="problem-details">Problem Details (RFC 9457)</option><option value="custom">Custom JSON</option><option value="none">Undocumented</option></select></label>
        <div className="flex flex-col justify-end gap-1 text-sm text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={e.paginated} onChange={x => set('paginated', x.target.checked)} />Paginated (cursor)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={e.idempotencyKey} onChange={x => set('idempotencyKey', x.target.checked)} />Idempotency-Key header</label>
        </div>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink-2">Status codes</legend>
        <div className="flex flex-wrap gap-1">
          {CODES.map(c => <button key={c} onClick={() => set('statusCodes', e.statusCodes.includes(c) ? e.statusCodes.filter(x => x !== c) : [...e.statusCodes, c].sort())} aria-pressed={e.statusCodes.includes(c)}
            className={cx('rounded border px-2 py-0.5 font-mono text-xs', e.statusCodes.includes(c) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3')}>{c}</button>)}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldsEditor label="Request body" fields={e.request} onChange={f => set('request', f)} />
        <FieldsEditor label="Response body" fields={e.response} onChange={f => set('response', f)} />
      </div>
      <Button size="sm" variant="ghost" onClick={onRemove}>Delete endpoint</Button>
    </div>
  );
}

export default function ApiPlayground() {
  const [contract, setContractState] = useState<ApiContract>(() => readJson('api:contract', sampleContract()));
  const [baseline, setBaseline] = useState<ApiContract | null>(() => readJson<ApiContract | null>('api:baseline', null));
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<'lint' | 'openapi' | 'compare'>('lint');
  const [fmt, setFmt] = useState<'yaml' | 'json'>('yaml');
  const setContract = (c: ApiContract) => { setContractState(c); writeJson('api:contract', c); };
  const issues = useMemo(() => lintContract(contract), [contract]);
  const doc = useMemo(() => toOpenApi(contract), [contract]);
  const text = fmt === 'yaml' ? toYaml(doc) : JSON.stringify(doc, null, 2);
  const changes = baseline ? compareContracts(baseline, contract) : [];
  const e = contract.endpoints[sel];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="API design playground" actions={<Button size="sm" onClick={() => { setContract(sampleContract()); setSel(0); }}>Load sample</Button>}>
        Design an HTTP API, check it against REST conventions, export an OpenAPI 3.1 document, and see which changes would break existing clients. The sample deliberately contains a flawed payment endpoint — fix it.
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card title="Endpoints" action={<button className="text-xs text-accent" onClick={() => { setContract({ ...contract, endpoints: [...contract.endpoints, newEndpoint()] }); setSel(contract.endpoints.length); }}>+ Add</button>}>
          <div className="mb-3 space-y-1.5">
            <input aria-label="API title" value={contract.title} onChange={x => setContract({ ...contract, title: x.target.value })} className="w-full rounded border border-line bg-surface px-2 py-1 text-sm text-ink" />
            <div className="flex gap-1.5"><input aria-label="Base path" value={contract.basePath} onChange={x => setContract({ ...contract, basePath: x.target.value })} className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-ink" /><input aria-label="Version" value={contract.version} onChange={x => setContract({ ...contract, version: x.target.value })} className="w-16 rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-ink" /></div>
          </div>
          <ul className="space-y-0.5">
            {contract.endpoints.map((x, i) => {
              const n = issues.filter(is => is.endpointId === x.id && is.severity !== 'tip').length;
              return <li key={x.id}><button onClick={() => setSel(i)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-xs', i === sel ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2')}><span className="w-12 shrink-0 font-semibold">{x.method}</span><span className="min-w-0 flex-1 truncate">{x.path}</span>{n > 0 && <Badge tone="warn">{n}</Badge>}</button></li>;
            })}
          </ul>
        </Card>
        <div className="min-w-0 space-y-4">
          <Card>{e ? <EndpointEditor e={e} onChange={ne => setContract({ ...contract, endpoints: contract.endpoints.map((x, i) => i === sel ? ne : x) })} onRemove={() => { setContract({ ...contract, endpoints: contract.endpoints.filter((_, i) => i !== sel) }); setSel(0); }} /> : <p className="text-sm text-ink-3">Add an endpoint to begin.</p>}</Card>
          <Card>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'lint', label: `Review (${issues.length})` }, { id: 'openapi', label: 'OpenAPI 3.1' }, { id: 'compare', label: 'Breaking changes' }]} />
            <div className="pt-3">
              {tab === 'lint' && (issues.length ? (
                <ul className="space-y-2">
                  {issues.map((is, i) => {
                    const ep = contract.endpoints.find(x => x.id === is.endpointId);
                    return <li key={i} className="rounded-md border border-line p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={is.severity === 'error' ? 'bad' : is.severity === 'warning' ? 'warn' : 'neutral'}>{is.severity}</Badge>{ep && <span className="font-mono text-xs text-ink-3">{ep.method} {ep.path}</span>}<span className="text-ink">{is.message}</span></div>
                      <p className="mt-1 text-xs text-ink-2">{is.why}</p></li>;
                  })}
                </ul>) : <p className="text-sm text-ok">No issues found by the rules. Rules catch conventions, not every design problem — still review naming and semantics yourself.</p>)}
              {tab === 'openapi' && (
                <div>
                  <div className="flex flex-wrap gap-2"><Button size="sm" variant={fmt === 'yaml' ? 'primary' : 'secondary'} onClick={() => setFmt('yaml')}>YAML</Button><Button size="sm" variant={fmt === 'json' ? 'primary' : 'secondary'} onClick={() => setFmt('json')}>JSON</Button>
                    <Button size="sm" onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), `openapi.${fmt}`)}>Download</Button></div>
                  <CodeBlock code={text} lang={fmt} title={`openapi.${fmt}`} />
                </div>
              )}
              {tab === 'compare' && (
                <div className="space-y-3 text-sm">
                  <p className="text-ink-2">Save the current contract as the published version, make changes, and see which ones would break existing clients.</p>
                  <div className="flex gap-2"><Button size="sm" onClick={() => { setBaseline(contract); writeJson('api:baseline', contract); }}>Save current as published v{contract.version}</Button>{baseline && <Button size="sm" variant="ghost" onClick={() => { setBaseline(null); writeJson('api:baseline', null); }}>Clear baseline</Button>}</div>
                  {!baseline ? <p className="text-ink-3">No baseline saved yet.</p> : !changes.length ? <p className="text-ink-3">No differences from the baseline.</p> : (
                    <ul className="space-y-1">{changes.map((c, i) => <li key={i} className="flex gap-2"><Badge tone={c.kind === 'breaking' ? 'bad' : 'ok'}>{c.kind}</Badge><span className="text-ink">{c.message}</span></li>)}</ul>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
