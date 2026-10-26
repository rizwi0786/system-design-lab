import { describe, expect, it } from 'vitest';
import { analyzeModel, compareModels, findCycles, inheritanceDepth } from './analyze';
import { toCSharp, toMermaid, toStateDiagram } from './generate';
import { normalizeModel, parseMember } from './model';
import type { ClassModel, ClassNode, Relation } from './model';
import { LLD_TEMPLATES } from './templates';

const cls = (id: string, extra: Partial<ClassNode> = {}): ClassNode => ({ id, name: id, kind: 'class', fields: [], methods: [], responsibility: 'does one thing', ...extra });
const rel = (from: string, to: string, kind: Relation['kind']): Relation => ({ from, to, kind });
const model = (classes: ClassNode[], relations: Relation[] = []): ClassModel => ({ classes, relations });
const ids = (m: ClassModel, prefix: string) => analyzeModel(m).filter((f) => f.id.startsWith(prefix));

describe('parseMember', () => {
  it('parses methods with visibility, return type and params', () => {
    const m = parseMember('+decimal Calculate(Order order)');
    expect(m).toMatchObject({ visibility: 'public', name: 'Calculate', type: 'decimal', params: 'Order order', isMethod: true });
  });
  it('parses generic methods and properties', () => {
    expect(parseMember('Task<int> GetAsync<T>(int id)').name).toBe('GetAsync');
    const p = parseMember('+string Name { get; set; }');
    expect(p).toMatchObject({ isProperty: true, name: 'Name', type: 'string', visibility: 'public' });
    expect(parseMember('-decimal _percent')).toMatchObject({ visibility: 'private', name: '_percent', type: 'decimal' });
  });
});

describe('normalizeModel', () => {
  it('fills defaults and resolves relations by name', () => {
    const m = normalizeModel({ classes: [{ name: 'A' }, { name: 'B', kind: 'interface' }], relations: [{ from: 'A', to: 'b', kind: 'implements' }, { from: 'A', to: 'Z' }] });
    expect(m.classes[0]).toMatchObject({ id: 'A', kind: 'class', fields: [], methods: [] });
    expect(m.relations).toHaveLength(1);
    expect(m.relations[0]).toMatchObject({ from: 'A', to: 'B', kind: 'implements', id: 'r1' });
  });
  it('rejects non-models', () => {
    expect(() => normalizeModel({})).toThrow();
    expect(() => normalizeModel(null)).toThrow();
  });
});

describe('toMermaid', () => {
  it('emits annotations, generics, members and arrows', () => {
    const src = toMermaid(model(
      [cls('I', { name: 'IRepo', kind: 'interface', methods: ['Task<T> Get(int id)'] }), cls('R', { name: 'Repo<T>', fields: ['-List<T> _items'], methods: ['+void Add(T item)'] }), cls('E', { name: 'Size', kind: 'enum', fields: ['Small', 'Large'] })],
      [rel('R', 'I', 'implements'), { from: 'R', to: 'E', kind: 'composition', label: 'has', multiplicity: '1..*' }],
    ));
    expect(src).toContain('classDiagram');
    expect(src).toContain('class IRepo {');
    expect(src).toContain('<<interface>>');
    expect(src).toContain('Get(int id) Task~T~');
    expect(src).toContain('class Repo~T~ {');
    expect(src).toContain('-List~T~ _items');
    expect(src).toContain('<<enumeration>>');
    expect(src).toContain('Repo ..|> IRepo');
    expect(src).toContain('Repo *-- "1..*" Size : has');
  });
  it('maps every relation kind', () => {
    const kinds: Relation['kind'][] = ['inherits', 'implements', 'composition', 'aggregation', 'association', 'dependency'];
    const arrows = ['--|>', '..|>', '*--', 'o--', '-->', '..>'];
    kinds.forEach((k, i) => expect(toMermaid(model([cls('A'), cls('B')], [rel('A', 'B', k)]))).toContain(`A ${arrows[i]} B`));
  });
  it('strips property braces that would break Mermaid', () => {
    expect(toMermaid(model([cls('A', { fields: ['+string Name { get; set; }'] })]))).toContain('+string Name\n');
  });
});

describe('toCSharp', () => {
  const m = model([
    cls('IShape', { kind: 'interface', methods: ['double Area()', 'string Name()'], fields: ['+string Label'] }),
    cls('Shape', { kind: 'abstract', methods: ['+double Area()*'], fields: ['#string _id'] }),
    cls('Circle', { fields: ['-double _r', '+string Tag { get; set; }'], methods: ['+Circle(double r)', '+double Area()'] }),
    cls('Point', { kind: 'record', fields: ['+double X', '+double Y'] }),
    cls('Color', { kind: 'enum', fields: ['Red', 'Green = 2'] }),
  ], [rel('Shape', 'IShape', 'implements'), rel('Circle', 'Shape', 'inherits')]);
  const files = Object.fromEntries(toCSharp(m).map((f) => [f.name, f.code]));

  it('one file per class', () => expect(Object.keys(files)).toEqual(['IShape.cs', 'Shape.cs', 'Circle.cs', 'Point.cs', 'Color.cs']));
  it('interfaces have signatures and properties', () => {
    expect(files['IShape.cs']).toContain('public interface IShape');
    expect(files['IShape.cs']).toContain('    double Area();');
    expect(files['IShape.cs']).toContain('    string Label { get; }');
    expect(files['IShape.cs']).toContain('namespace Design;');
  });
  it('abstract classes get abstract members and stubs for missing interface methods', () => {
    expect(files['Shape.cs']).toContain('public abstract class Shape : IShape');
    expect(files['Shape.cs']).toContain('public abstract double Area();');
    expect(files['Shape.cs']).toContain('public abstract string Name();');
    expect(files['Shape.cs']).toContain('protected string _id;');
  });
  it('classes inherit, get constructors and stubs', () => {
    expect(files['Circle.cs']).toContain('public class Circle : Shape');
    expect(files['Circle.cs']).toContain('public Circle(double r)');
    expect(files['Circle.cs']).toContain('public double Area() => throw new NotImplementedException();');
    expect(files['Circle.cs']).toContain('public string Tag { get; set; }');
    expect(files['Circle.cs']).toContain('private double _r;');
  });
  it('records and enums', () => {
    expect(files['Point.cs']).toContain('public record Point(double X, double Y);');
    expect(files['Color.cs']).toContain('public enum Color');
    expect(files['Color.cs']).toContain('Green = 2');
  });
  it('base class precedes interfaces', () => {
    const f = toCSharp(model([cls('I', { kind: 'interface' }), cls('B'), cls('C')], [rel('C', 'I', 'implements'), rel('C', 'B', 'inherits')]));
    expect(f[2].code).toContain('public class C : B, I');
  });
});

describe('toStateDiagram', () => {
  it('renders states, initial state and transitions', () => {
    const s = toStateDiagram(['Active', 'On Loan'], [{ from: 'Active', to: 'On Loan', event: 'borrow' }, { from: 'On Loan', to: '[*]' }]);
    expect(s).toBe('stateDiagram-v2\n  state "On Loan" as On_Loan\n  [*] --> Active\n  Active --> On_Loan : borrow\n  On_Loan --> [*]');
  });
});

describe('findCycles / inheritanceDepth', () => {
  it('finds SCCs and self loops deterministically', () => {
    expect(findCycles(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'a'], ['c', 'c'], ['c', 'd']])).toEqual([['a', 'b'], ['c']]);
    expect(findCycles(['a', 'b'], [['a', 'b']])).toEqual([]);
  });
  it('counts inheritance depth and survives cycles', () => {
    const rs = [rel('D', 'C', 'inherits'), rel('C', 'B', 'inherits'), rel('B', 'A', 'inherits')];
    expect(inheritanceDepth('D', rs)).toBe(3);
    expect(inheritanceDepth('A', rs)).toBe(0);
    expect(inheritanceDepth('X', [rel('X', 'Y', 'inherits'), rel('Y', 'X', 'inherits')])).toBe(2);
  });
});

describe('analyzeModel', () => {
  it('circular dependency → warning', () => {
    const f = ids(model([cls('A'), cls('B')], [rel('A', 'B', 'association'), rel('B', 'A', 'dependency')]), 'cycle:');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: 'warning', classIds: ['A', 'B'] });
  });
  it('composition cycle → error and not also a plain cycle warning', () => {
    const m = model([cls('A'), cls('B')], [rel('A', 'B', 'composition'), rel('B', 'A', 'composition')]);
    expect(ids(m, 'composition-cycle:')[0].severity).toBe('error');
    expect(ids(m, 'cycle:')).toHaveLength(0);
  });
  it('more than 7 dependencies → warning', () => {
    const targets = Array.from({ length: 8 }, (_, i) => cls(`T${i}`));
    const m = model([cls('Hub'), ...targets], targets.map((t) => rel('Hub', t.id, 'dependency')));
    expect(ids(m, 'coupling:')).toMatchObject([{ severity: 'warning', classIds: ['Hub'] }]);
    const m7 = model([cls('Hub'), ...targets.slice(0, 7)], targets.slice(0, 7).map((t) => rel('Hub', t.id, 'dependency')));
    expect(ids(m7, 'coupling:')).toHaveLength(0);
  });
  it('god class by methods or fields', () => {
    expect(ids(model([cls('G', { methods: Array.from({ length: 13 }, (_, i) => `+void M${i}()`) })]), 'god-class:')[0].severity).toBe('warning');
    expect(ids(model([cls('G', { fields: Array.from({ length: 11 }, (_, i) => `-int f${i}`) })]), 'god-class:')).toHaveLength(1);
    expect(ids(model([cls('G', { methods: Array.from({ length: 12 }, (_, i) => `+void M${i}()`) })]), 'god-class:')).toHaveLength(0);
  });
  it('interface with > 6 methods → tradeoff (ISP)', () => {
    const f = ids(model([cls('I', { kind: 'interface', methods: Array.from({ length: 7 }, (_, i) => `void M${i}()`) })]), 'isp:');
    expect(f[0].severity).toBe('tradeoff');
  });
  it('concrete → concrete while an interface exists → tradeoff (DIP)', () => {
    const m = model([cls('Svc'), cls('SqlRepo', { methods: ['+void Save()'] }), cls('IRepo', { kind: 'interface', methods: ['void Save()'] })],
      [rel('Svc', 'SqlRepo', 'association'), rel('SqlRepo', 'IRepo', 'implements')]);
    expect(ids(m, 'dip:')).toMatchObject([{ severity: 'tradeoff', classIds: ['Svc', 'SqlRepo'] }]);
    const ok = model(m.classes, [rel('Svc', 'IRepo', 'association'), rel('SqlRepo', 'IRepo', 'implements')]);
    expect(ids(ok, 'dip:')).toHaveLength(0);
  });
  it('implements but none of the method names → error; inherited methods count', () => {
    const iface = cls('I', { kind: 'interface', methods: ['void Run()'] });
    expect(ids(model([iface, cls('C')], [rel('C', 'I', 'implements')]), 'unimplemented:')[0].severity).toBe('error');
    expect(ids(model([iface, cls('C', { methods: ['+void Run()'] })], [rel('C', 'I', 'implements')]), 'unimplemented:')).toHaveLength(0);
    expect(ids(model([iface, cls('B', { methods: ['+void Run()'] }), cls('C')], [rel('C', 'I', 'implements'), rel('C', 'B', 'inherits')]), 'unimplemented:')).toHaveLength(0);
  });
  it('inheritance depth > 3 → tradeoff', () => {
    const cs = ['A', 'B', 'C', 'D', 'E'].map((x) => cls(x));
    const rs = [rel('B', 'A', 'inherits'), rel('C', 'B', 'inherits'), rel('D', 'C', 'inherits'), rel('E', 'D', 'inherits')];
    expect(ids(model(cs, rs), 'depth:')).toMatchObject([{ severity: 'tradeoff', classIds: ['E'] }]);
  });
  it('missing responsibility and isolated class → info', () => {
    const m = model([cls('A', { responsibility: '' }), cls('B'), cls('C')], [rel('B', 'C', 'association')]);
    expect(ids(m, 'no-responsibility:')).toMatchObject([{ severity: 'info', classIds: ['A'] }]);
    expect(ids(m, 'isolated:')).toMatchObject([{ severity: 'info', classIds: ['A'] }]);
    expect(ids(model([cls('Solo')]), 'isolated:')).toHaveLength(0);
  });
  it('public fields without property syntax → info', () => {
    const f = ids(model([cls('A', { fields: ['+int Balance', '+string Name { get; set; }', '-int _x', '+const int Max'] })]), 'public-fields:');
    expect(f).toHaveLength(1);
    expect(f[0].detail).toContain('Balance');
    expect(f[0].detail).not.toContain('Name');
  });
  it('is deterministic and sorted by severity', () => {
    const m = model([cls('A', { responsibility: '' }), cls('B'), cls('I', { kind: 'interface', methods: ['void X()'] })], [rel('A', 'B', 'composition'), rel('B', 'A', 'composition'), rel('A', 'I', 'implements')]);
    const a = analyzeModel(m);
    expect(analyzeModel(m)).toEqual(a);
    const order = { error: 0, warning: 1, tradeoff: 2, info: 3 };
    for (let i = 1; i < a.length; i++) expect(order[a[i].severity]).toBeGreaterThanOrEqual(order[a[i - 1].severity]);
  });
  it('templates have no definite errors', () => {
    for (const t of LLD_TEMPLATES) expect(analyzeModel(t.model).filter((f) => f.severity === 'error'), t.id).toEqual([]);
  });
});

describe('compareModels', () => {
  it('reports class and relation differences case-insensitively', () => {
    const ref = model([cls('Order'), cls('Item'), cls('Payment', { methods: ['+void Pay()'] })], [rel('Order', 'Item', 'composition'), rel('Order', 'Payment', 'association')]);
    const mine = model([cls('order'), cls('ITEM'), cls('Invoice'), cls('payment', { methods: ['+void Refund()'] })], [rel('order', 'ITEM', 'aggregation'), rel('Invoice', 'order', 'dependency')]);
    const c = compareModels(mine, ref);
    expect(c.matchedClasses).toEqual(['Order', 'Item', 'Payment']);
    expect(c.missingClasses).toEqual([]);
    expect(c.extraClasses).toEqual(['Invoice']);
    expect(c.relationKindDifferences).toEqual([{ from: 'Order', to: 'Item', mine: 'aggregation', reference: 'composition' }]);
    expect(c.missingRelations).toEqual([{ from: 'Order', to: 'Payment', kind: 'association' }]);
    expect(c.extraRelations).toEqual([{ from: 'Invoice', to: 'order', kind: 'dependency' }]);
    expect(c.methodDifferences).toEqual([{ name: 'Payment', onlyInReference: ['Pay'], onlyInMine: ['Refund'] }]);
  });
  it('reports missing classes and kind differences', () => {
    const c = compareModels(model([cls('A')]), model([cls('A', { kind: 'interface' }), cls('B')]));
    expect(c.missingClasses).toEqual(['B']);
    expect(c.kindDifferences).toEqual([{ name: 'A', mine: 'class', reference: 'interface' }]);
  });
});
