import { parseCompare, parseFlow, parseStats, parseSteps, splitNumber } from '../visuals';
import { parseLesson } from '../lessonParser';

describe('visual directives', () => {
  it('parses a flow and lays nodes out by hop distance', () => {
    const { flow, errors } = parseFlow(`
app | Mobile app | client
lb | Load balancer | lb
api | Orders API | service
cache | Redis | cache
db | PostgreSQL | db
---
app -> lb | POST /orders
lb -> api | forward
api -> cache | read stock
api -> db | INSERT order
db -> api | committed
api -> app | 201 Created`);
    expect(errors).toEqual([]);
    expect(flow.steps).toHaveLength(6);
    const col = Object.fromEntries(flow.nodes.map(n => [n.id, n.col]));
    expect(col).toEqual({ app: 0, lb: 1, api: 1, cache: 2, db: 2 });
    expect(flow.nodes.find(n => n.id === 'db')!.row).toBe(1);
  });

  it('reports flow mistakes', () => {
    const { errors } = parseFlow('a | A | robot\n---\na -> b | x');
    expect(errors.join('\n')).toMatch(/unknown role "robot"/);
    expect(errors.join('\n')).toMatch(/unknown node "b"/);
    expect(parseFlow('a | A\nb | B').errors.join()).toMatch(/---/);
  });

  it('parses steps, compare and stats', () => {
    expect(parseSteps('::step One\ntext\n::step Two\n```cs\n::step not a step\n```').steps.map(s => s.title)).toEqual(['One', 'Two']);
    const c = parseCompare('::bad Shared helper\nx\n::good One home per actor\ny');
    expect(c.errors).toEqual([]);
    expect(c.sides.map(s => s.tone)).toEqual(['bad', 'good']);
    expect(parseStats('Peak | 1,250 req/s | festival\nStorage | 2.4 TB').stats[0]).toEqual({ label: 'Peak', value: '1,250 req/s', note: 'festival' });
    expect(parseStats('only one | 1').errors.length).toBeGreaterThan(0);
  });

  it('splits numbers for count-up', () => {
    expect(splitNumber('≈ 1,250 req/s')).toEqual({ prefix: '≈ ', num: 1250, decimals: 0, grouped: true, suffix: ' req/s' });
    expect(splitNumber('99.95 %').decimals).toBe(2);
    expect(splitNumber('n/a').num).toBeNull();
  });

  it('lesson parser turns directives into visual blocks and validates them', () => {
    const md = `---\nid: x\ntitle: X\nmodule: m01\nlevel: beginner\nstatus: draft\nsummary: s\n---\n\n## A\n\n:::tldr\n- one\n:::\n\n:::stats title="Load"\nPeak | 140/s\nDaily | 2M\n:::\n\n:::flow\na | A | client\n---\na -> zz | bad\n:::\n`;
    const p = parseLesson(md);
    const kinds = p.sections[0].blocks.filter(b => b.type === 'visual').map(b => (b as { kind: string }).kind);
    expect(kinds).toEqual(['tldr', 'stats', 'flow']);
    expect(p.visualCount).toBe(3);
    expect(p.errors.join('\n')).toMatch(/unknown node "zz"/);
  });
});
