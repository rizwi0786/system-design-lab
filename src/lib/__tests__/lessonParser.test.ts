import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLesson, validateLesson, parseAttrs, extractCodeFiles } from '../lessonParser';

const strategy = readFileSync(join(process.cwd(), 'content/lessons/m06/m06-strategy.md'), 'utf8');

describe('lessonParser', () => {
  it('parses the Strategy lesson and passes validation', () => {
    const p = parseLesson(strategy);
    expect(p.meta.id).toBe('m06-strategy');
    expect(p.meta.module).toBe('m06');
    expect(p.exercises.length).toBeGreaterThanOrEqual(5);
    expect(p.quiz?.questions.length).toBeGreaterThanOrEqual(5);
    expect(p.flashcards.length).toBeGreaterThanOrEqual(5);
    expect(p.mermaidCount).toBeGreaterThanOrEqual(2);
    expect(p.csharpBlockCount).toBeGreaterThan(0);
    const v = validateLesson(p);
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('parses quiz answers, multi-select and explanations', () => {
    const src = `---\nid: x\ntitle: X\nmodule: m01\nlevel: beginner\nstatus: draft\nsummary: s\n---\n## Knowledge check\n:::quiz pass=80\n::q single\nPick one\n- [ ] a\n- [x] b\n> because b\n::q multi\nPick two\n- [x] a\n- [ ] b\n- [x] c\n> a and c\n:::\n`;
    const p = parseLesson(src);
    expect(p.quiz?.passMark).toBe(80);
    expect(p.quiz?.questions[0].answer).toEqual([1]);
    expect(p.quiz?.questions[1].kind).toBe('multi');
    expect(p.quiz?.questions[1].answer).toEqual([0, 2]);
    expect(p.quiz?.questions[1].explanation).toBe('a and c');
    expect(p.errors).toEqual([]);
  });

  it('ignores directive markers inside code fences', () => {
    const src = '---\nid: x\ntitle: X\nmodule: m01\nlevel: beginner\nstatus: draft\nsummary: s\n---\n## A\n```text\n:::quiz\n## not a heading\n```\nafter\n';
    const p = parseLesson(src);
    expect(p.sections.map(s => s.title)).toEqual(['A']);
    expect(p.quiz).toBeNull();
  });

  it('reports unclosed directives and missing pieces', () => {
    const p = parseLesson('---\nid: x\ntitle: X\nmodule: m01\nlevel: beginner\nstatus: draft\nsummary: s\n---\n:::exercise id=e1 difficulty=beginner\nDo it\n');
    expect(p.errors.some(e => e.includes('never closed'))).toBe(true);
    expect(p.errors.some(e => e.includes('acceptance'))).toBe(true);
    expect(validateLesson(p).ok).toBe(false);
  });

  it('parses exercise subsections and code files', () => {
    const src = '---\nid: x\ntitle: X\nmodule: m01\nlevel: beginner\nstatus: draft\nsummary: s\n---\n:::exercise id=e1 difficulty=intermediate kind=code title="T 1"\nDesc\n::acceptance\n- one\n- two\n::hint\nh1\n::hint\nh2\n::hint\nh3\n::starter\n```csharp file=A.cs\nclass A {}\n```\n::tests\n```csharp file=ATests.cs\nclass T {}\n```\n::solution\nSol\n:::\n';
    const p = parseLesson(src);
    const ex = p.exercises[0];
    expect(ex.title).toBe('T 1');
    expect(ex.difficulty).toBe('intermediate');
    expect(ex.acceptance).toEqual(['one', 'two']);
    expect(ex.hints).toHaveLength(3);
    expect(ex.starter[0]).toMatchObject({ name: 'A.cs', language: 'csharp', explicitName: true });
    expect(ex.tests[0].name).toBe('ATests.cs');
    expect(p.errors).toEqual([]);
  });

  it('parses attributes with quotes', () => {
    expect(parseAttrs('a=1 b="two words" c=\'x\'')).toEqual({ a: '1', b: 'two words', c: 'x' });
    expect(extractCodeFiles('```sql\nselect 1;\n```')[0]).toMatchObject({ language: 'sql', code: 'select 1;' });
  });
});
