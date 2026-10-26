import { lintContract, sampleContract, compareContracts, toOpenApi, toYaml, type ApiContract } from '../apiLint';

describe('API lint', () => {
  const c = sampleContract();
  const issues = lintContract(c);
  const forEp = (id: string) => issues.filter(i => i.endpointId === id).map(i => i.rule);
  it('flags the deliberately flawed payment endpoint', () => {
    const r = forEp('createPayment');
    expect(r).toEqual(expect.arrayContaining(['noun-resources', 'idempotency', 'auth', 'problem-details']));
  });
  it('accepts the well-designed endpoints', () => {
    expect(issues.filter(i => i.endpointId === 'createOrder' && i.severity !== 'tip')).toEqual([]);
    expect(forEp('listOrders')).not.toContain('pagination');
  });
  it('requires pagination on list endpoints', () => {
    const cc: ApiContract = { ...c, endpoints: [{ ...c.endpoints[0], paginated: false }] };
    expect(lintContract(cc).map(i => i.rule)).toContain('pagination');
  });
  it('detects duplicate routes', () => {
    const cc: ApiContract = { ...c, endpoints: [c.endpoints[2], { ...c.endpoints[2], id: 'dup', path: '/orders/{id}' }] };
    expect(lintContract(cc).some(i => i.rule === 'duplicate-route')).toBe(true);
  });
});

describe('breaking changes', () => {
  const base = sampleContract();
  it('detects removed fields, new required fields and removed endpoints', () => {
    const next = structuredClone(base);
    next.endpoints[0].response = next.endpoints[0].response.filter(f => f.name !== 'status');
    next.endpoints[1].request.push({ name: 'channel', type: 'string', required: true });
    next.endpoints.splice(2, 1);
    const ch = compareContracts(base, next);
    const breaking = ch.filter(c => c.kind === 'breaking').map(c => c.message).join('\n');
    expect(breaking).toMatch(/"status" removed/);
    expect(breaking).toMatch(/new required request field "channel"/);
    expect(breaking).toMatch(/Removed endpoint GET \/orders\/\{\}/);
  });
  it('treats additions as non-breaking', () => {
    const next = structuredClone(base);
    next.endpoints[0].response.push({ name: 'currency', type: 'string', required: false });
    expect(compareContracts(base, next)).toEqual([{ kind: 'non-breaking', message: 'GET /orders: new response field "currency"' }]);
  });
});

describe('OpenAPI export', () => {
  it('produces a 3.1 document with security and Location headers', () => {
    const doc = toOpenApi(sampleContract()) as { openapi: string; paths: Record<string, Record<string, { responses: Record<string, { headers?: unknown }>; parameters: { name: string }[] }>> };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/api/v1/orders'].post.responses['201'].headers).toBeDefined();
    expect(doc.paths['/api/v1/orders'].post.parameters.map(p => p.name)).toContain('Idempotency-Key');
    expect(doc.paths['/api/v1/orders'].get.parameters.map(p => p.name)).toContain('cursor');
    const yaml = toYaml(doc);
    expect(yaml).toContain('openapi: 3.1.0');
    expect(yaml).toContain('/api/v1/orders/{orderId}:');
  });
});
