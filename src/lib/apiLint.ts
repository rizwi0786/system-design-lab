// API contract model, lint rules, OpenAPI export and breaking-change detection for the API playground.
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface FieldDef { name: string; type: 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array'; required: boolean }
export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  auth: 'none' | 'bearer' | 'cookie' | 'api-key';
  request: FieldDef[];
  response: FieldDef[];
  statusCodes: number[];
  paginated: boolean;
  idempotencyKey: boolean;
  errorFormat: 'problem-details' | 'custom' | 'none';
}
export interface ApiContract { title: string; version: string; basePath: string; endpoints: Endpoint[] }

export type Severity = 'error' | 'warning' | 'tip';
export interface LintIssue { endpointId?: string; rule: string; severity: Severity; message: string; why: string }

const VERBS = ['get', 'create', 'update', 'delete', 'add', 'remove', 'fetch', 'list', 'make', 'do', 'set', 'save', 'insert'];
const PAYMENTISH = /(payment|charge|transfer|order|refund|payout|booking|checkout)/i;

export function segments(path: string): string[] { return path.split('/').filter(Boolean); }
const isParam = (seg: string) => /^\{.+\}$/.test(seg) || seg.startsWith(':');

export function lintEndpoint(e: Endpoint, c: ApiContract): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (rule: string, severity: Severity, message: string, why: string) => issues.push({ endpointId: e.id, rule, severity, message, why });
  const segs = segments(e.path);
  if (!e.path.startsWith('/')) add('path-leading-slash', 'error', 'Path must start with "/".', 'OpenAPI paths are absolute relative to the server URL.');
  const literal = segs.filter(s => !isParam(s));
  for (const s of literal) {
    const lower = s.toLowerCase();
    if (VERBS.some(v => lower.startsWith(v) && lower.length > v.length && /[A-Z_-]/.test(s.slice(v.length, v.length + 1) || '-')) || VERBS.includes(lower))
      add('noun-resources', 'warning', `Segment "${s}" looks like a verb.`, 'In REST, the HTTP method is the verb and the path names a resource: use POST /orders, not /createOrder.');
    if (/[A-Z]/.test(s)) add('kebab-case', 'tip', `Segment "${s}" uses capitals.`, 'URLs are case-sensitive; lower-case kebab-case avoids duplicate-looking routes.');
  }
  const collection = [...literal].reverse().find(s => !/^v\d+$/.test(s));
  if (collection && !collection.endsWith('s') && !['me', 'health', 'search', 'status', 'login', 'logout', 'token'].includes(collection) && segs[segs.length - 1] === collection)
    add('plural-collections', 'tip', `Collection "${collection}" is singular.`, 'Plural collection names (/orders, /orders/{id}) keep URLs predictable.');
  if (!segs.some(s => /^v\d+$/.test(s)) && !/^v\d+/.test(c.version) && !c.basePath.match(/\/v\d+/))
    add('versioning', 'tip', 'No version in path or base path.', 'Pick a versioning scheme (URL /v1, header or media type) before the first external client depends on you.');
  if (e.method === 'POST' && !e.statusCodes.includes(201) && !e.statusCodes.includes(202) && !e.statusCodes.includes(200))
    add('post-status', 'warning', 'POST has no success status code.', 'A create should return 201 Created with a Location header; an accepted async job returns 202.');
  if (e.method === 'POST' && e.statusCodes.includes(200) && !e.statusCodes.includes(201) && segs.length && !isParam(segs[segs.length - 1]) && !/search|query|login|token/.test(e.path))
    add('create-201', 'tip', 'Creating a resource usually returns 201 Created, not 200.', '201 + Location tells the client exactly where the new resource lives.');
  if (e.method === 'DELETE' && !e.statusCodes.includes(204) && !e.statusCodes.includes(200) && !e.statusCodes.includes(202))
    add('delete-status', 'warning', 'DELETE has no success status code.', 'Return 204 No Content (or 202 if deletion is asynchronous).');
  if (e.method === 'GET' && e.request.length) add('get-body', 'error', 'GET with a request body.', 'Many proxies and caches drop GET bodies; use query parameters.');
  if (e.method === 'GET' && segs.length && !isParam(segs[segs.length - 1]) && !e.paginated && collection?.endsWith('s'))
    add('pagination', 'warning', 'List endpoint without pagination.', 'Unbounded lists get slower as data grows and can time out; use cursor (keyset) or page/limit parameters.');
  if (e.method === 'POST' && PAYMENTISH.test(e.path) && !e.idempotencyKey)
    add('idempotency', 'error', 'Money-moving POST without an Idempotency-Key.', 'Clients retry on timeouts. Without a key, a retry can charge the customer twice.');
  if (e.errorFormat !== 'problem-details') add('problem-details', e.errorFormat === 'none' ? 'warning' : 'tip', 'Errors are not RFC 9457 Problem Details.', 'One consistent error shape (type, title, status, detail) lets every client handle errors the same way; ASP.NET Core supports it via AddProblemDetails().');
  if (e.auth === 'none' && e.method !== 'GET' && !/login|token|register|signup|webhook/.test(e.path))
    add('auth', 'warning', 'Write endpoint without authentication.', 'Anyone could call it. If it is intentionally public, rate-limit it and say so in the summary.');
  if (e.auth !== 'none' && !e.statusCodes.includes(401)) add('auth-codes', 'tip', 'Protected endpoint does not document 401.', 'Document 401 (not authenticated) and 403 (authenticated but not allowed) so clients can react correctly.');
  if (!e.statusCodes.some(s => s >= 400 && s < 500) && (e.request.length || segs.some(isParam)))
    add('client-errors', 'tip', 'No 4xx responses documented.', 'Document 400 (validation) and 404 (not found) where they can happen.');
  if ((e.method === 'PUT' || e.method === 'PATCH' || e.method === 'DELETE') && !segs.some(isParam))
    add('item-path', 'warning', `${e.method} on a collection path.`, `${e.method} normally targets one resource: /orders/{id}.`);
  return issues;
}

export function lintContract(c: ApiContract): LintIssue[] {
  const issues = c.endpoints.flatMap(e => lintEndpoint(e, c));
  const keys = new Map<string, number>();
  for (const e of c.endpoints) { const k = `${e.method} ${normalisePath(e.path)}`; keys.set(k, (keys.get(k) ?? 0) + 1); }
  for (const [k, n] of keys) if (n > 1) issues.push({ rule: 'duplicate-route', severity: 'error', message: `Duplicate route ${k}.`, why: 'Two endpoints with the same method and path cannot both be routed.' });
  return issues;
}

export const normalisePath = (p: string) => '/' + segments(p).map(s => (isParam(s) ? '{}' : s.toLowerCase())).join('/');

// ---------- OpenAPI ----------
function schemaOf(fields: FieldDef[]) {
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map(f => [f.name, f.type === 'array' ? { type: 'array', items: {} } : { type: f.type }])),
    ...(fields.some(f => f.required) ? { required: fields.filter(f => f.required).map(f => f.name) } : {}),
  };
}
const REASON: Record<number, string> = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable' };

export function toOpenApi(c: ApiContract): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemes: Record<string, unknown> = {};
  for (const e of c.endpoints) {
    const p = (c.basePath.replace(/\/$/, '') + '/' + segments(e.path).map(s => (s.startsWith(':') ? `{${s.slice(1)}}` : s)).join('/')) || '/';
    const params: unknown[] = segments(e.path).filter(isParam).map(s => ({ name: s.replace(/[{}:]/g, ''), in: 'path', required: true, schema: { type: 'string' } }));
    if (e.paginated) params.push({ name: 'cursor', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100, default: 20 } });
    if (e.idempotencyKey) params.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } });
    const responses: Record<string, unknown> = {};
    for (const code of (e.statusCodes.length ? e.statusCodes : [200])) {
      const isErr = code >= 400;
      responses[String(code)] = {
        description: REASON[code] ?? 'Response',
        ...(code === 204 ? {} : isErr ? (e.errorFormat === 'problem-details' ? { content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } } } : {})
          : { content: { 'application/json': { schema: e.paginated ? { type: 'object', properties: { items: { type: 'array', items: schemaOf(e.response) }, nextCursor: { type: 'string', nullable: true } } } : schemaOf(e.response) } } }),
        ...(code === 201 ? { headers: { Location: { schema: { type: 'string' } } } } : {}),
      };
    }
    const op: Record<string, unknown> = { operationId: e.id, summary: e.summary, parameters: params, responses };
    if (e.request.length && e.method !== 'GET') op.requestBody = { required: true, content: { 'application/json': { schema: schemaOf(e.request) } } };
    if (e.auth !== 'none') { op.security = [{ [e.auth]: [] }]; schemes[e.auth] = e.auth === 'bearer' ? { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } : e.auth === 'api-key' ? { type: 'apiKey', in: 'header', name: 'X-Api-Key' } : { type: 'apiKey', in: 'cookie', name: '.AspNetCore.Cookies' }; }
    (paths[p] ??= {})[e.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: { title: c.title, version: c.version },
    paths,
    components: {
      schemas: { ProblemDetails: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, detail: { type: 'string' }, instance: { type: 'string' } } } },
      securitySchemes: schemes,
    },
  };
}

// ---------- breaking changes ----------
export interface ContractChange { kind: 'breaking' | 'non-breaking'; message: string }
export function compareContracts(oldC: ApiContract, newC: ApiContract): ContractChange[] {
  const out: ContractChange[] = [];
  const key = (e: Endpoint) => `${e.method} ${normalisePath(e.path)}`;
  const newBy = new Map(newC.endpoints.map(e => [key(e), e]));
  const oldBy = new Map(oldC.endpoints.map(e => [key(e), e]));
  for (const [k, o] of oldBy) {
    const n = newBy.get(k);
    if (!n) { out.push({ kind: 'breaking', message: `Removed endpoint ${k}` }); continue; }
    for (const f of o.response) {
      const nf = n.response.find(x => x.name === f.name);
      if (!nf) out.push({ kind: 'breaking', message: `${k}: response field "${f.name}" removed` });
      else if (nf.type !== f.type) out.push({ kind: 'breaking', message: `${k}: response field "${f.name}" changed type ${f.type} → ${nf.type}` });
    }
    for (const f of n.request) {
      const of = o.request.find(x => x.name === f.name);
      if (!of && f.required) out.push({ kind: 'breaking', message: `${k}: new required request field "${f.name}"` });
      else if (!of) out.push({ kind: 'non-breaking', message: `${k}: new optional request field "${f.name}"` });
      else if (of.type !== f.type) out.push({ kind: 'breaking', message: `${k}: request field "${f.name}" changed type ${of.type} → ${f.type}` });
      else if (!of.required && f.required) out.push({ kind: 'breaking', message: `${k}: request field "${f.name}" became required` });
    }
    for (const f of n.response) if (!o.response.some(x => x.name === f.name)) out.push({ kind: 'non-breaking', message: `${k}: new response field "${f.name}"` });
    if (o.auth === 'none' && n.auth !== 'none') out.push({ kind: 'breaking', message: `${k}: now requires authentication` });
    if (!o.idempotencyKey && n.idempotencyKey) out.push({ kind: 'breaking', message: `${k}: Idempotency-Key header is now required` });
    if (!o.paginated && n.paginated) out.push({ kind: 'breaking', message: `${k}: response is now paginated (shape changed)` });
  }
  for (const k of newBy.keys()) if (!oldBy.has(k)) out.push({ kind: 'non-breaking', message: `Added endpoint ${k}` });
  return out;
}

/** Tiny YAML emitter for the OpenAPI document (objects, arrays, scalars). */
export function toYaml(v: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const scalar = (x: unknown) => typeof x === 'string' ? (/^[\w./{}-]+$/.test(x) && !/^(true|false|null|\d+)$/.test(x) ? x : JSON.stringify(x)) : String(x);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return v.map(item => (item && typeof item === 'object') ? `${pad}- ${toYaml(item, indent + 1).trimStart()}` : `${pad}- ${scalar(item)}`).join('\n');
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return '{}';
    return entries.map(([k, val]) => {
      const key = /^[\w$./-][\w$./{}-]*$/.test(k) ? k : JSON.stringify(k);
      if (val && typeof val === 'object' && (Array.isArray(val) ? val.length : Object.keys(val).length)) return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
      if (val && typeof val === 'object') return `${pad}${key}: ${Array.isArray(val) ? '[]' : '{}'}`;
      return `${pad}${key}: ${scalar(val)}`;
    }).join('\n');
  }
  return pad + scalar(v);
}

export const sampleContract = (): ApiContract => ({
  title: 'Orders API', version: '1.0.0', basePath: '/api/v1',
  endpoints: [
    { id: 'listOrders', method: 'GET', path: '/orders', summary: 'List my orders', auth: 'bearer', request: [], response: [{ name: 'id', type: 'string', required: true }, { name: 'total', type: 'number', required: true }, { name: 'status', type: 'string', required: true }], statusCodes: [200, 401], paginated: true, idempotencyKey: false, errorFormat: 'problem-details' },
    { id: 'createOrder', method: 'POST', path: '/orders', summary: 'Place an order', auth: 'bearer', request: [{ name: 'items', type: 'array', required: true }, { name: 'couponCode', type: 'string', required: false }], response: [{ name: 'id', type: 'string', required: true }, { name: 'total', type: 'number', required: true }], statusCodes: [201, 400, 401, 409], paginated: false, idempotencyKey: true, errorFormat: 'problem-details' },
    { id: 'getOrder', method: 'GET', path: '/orders/{orderId}', summary: 'Get one order', auth: 'bearer', request: [], response: [{ name: 'id', type: 'string', required: true }, { name: 'total', type: 'number', required: true }, { name: 'status', type: 'string', required: true }], statusCodes: [200, 401, 404], paginated: false, idempotencyKey: false, errorFormat: 'problem-details' },
    { id: 'createPayment', method: 'POST', path: '/createPayment', summary: 'Pay for an order (deliberately flawed — fix the lint issues)', auth: 'none', request: [{ name: 'orderId', type: 'string', required: true }, { name: 'amount', type: 'number', required: true }], response: [{ name: 'paymentId', type: 'string', required: true }], statusCodes: [200], paginated: false, idempotencyKey: false, errorFormat: 'custom' },
  ],
});
