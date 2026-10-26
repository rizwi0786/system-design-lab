import { describe, expect, it } from 'vitest';
import { compareResults, normalizeValue } from './compare';
import type { QueryResult } from './compare';
import { buildSchema, hasTransactionControl, hintForError, positionToLineCol, schemaToMermaid, splitStatements } from './sqlUtils';
import { SQL_CHALLENGES } from './challenges';
import { SQL_DATASETS } from './datasets';

const q = (columns: string[], rows: unknown[][]): QueryResult => ({ columns, rows });

describe('normalizeValue', () => {
  it('numbers vs numeric strings', () => {
    expect(normalizeValue('10.50')).toBe(10.5);
    expect(normalizeValue(10.5)).toBe(10.5);
    expect(normalizeValue(3n)).toBe(3);
    expect(normalizeValue(1 / 3)).toBe(normalizeValue('0.33333333333333333333'));
    expect(normalizeValue(-0)).toBe(0);
  });
  it('dates to ISO and nulls', () => {
    expect(normalizeValue(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02T00:00:00.000Z');
    expect(normalizeValue('2026-01-02')).toBe('2026-01-02T00:00:00.000Z');
    expect(normalizeValue('2026-03-01 10:15:00+00')).toBe('2026-03-01T10:15:00.000Z');
    expect(normalizeValue('2026-03-01 15:45:00+05:30')).toBe('2026-03-01T10:15:00.000Z');
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue('hello')).toBe('hello');
  });
  it('objects are key-order independent', () => {
    expect(JSON.stringify(normalizeValue({ b: 1, a: '2' }))).toBe('{"a":2,"b":1}');
  });
});

describe('compareResults', () => {
  const expected = q(['Name', 'total'], [['Asha', '100.00'], ['Bharat', 50], ['Chitra', null]]);
  it('passes for same data with different column case and value representation', () => {
    expect(compareResults(q(['name', 'TOTAL'], [['Asha', 100], ['Bharat', '50.0'], ['Chitra', undefined]]), expected, true)).toEqual({ equal: true });
  });
  it('unordered comparison is a multiset', () => {
    const shuffled = q(['name', 'total'], [['Chitra', null], ['Asha', 100], ['Bharat', 50]]);
    expect(compareResults(shuffled, expected, false).equal).toBe(true);
    const dup = q(['a'], [[1], [1], [2]]);
    expect(compareResults(q(['a'], [[1], [2], [2]]), dup, false).equal).toBe(false);
    expect(compareResults(q(['a'], [[2], [1], [1]]), dup, false).equal).toBe(true);
  });
  it('ordered comparison detects wrong order and says so', () => {
    const shuffled = q(['name', 'total'], [['Chitra', null], ['Asha', 100], ['Bharat', 50]]);
    const r = compareResults(shuffled, expected, true);
    expect(r.equal).toBe(false);
    expect(r.reason).toMatch(/order/i);
  });
  it('reports column count, column name and row count differences', () => {
    expect(compareResults(q(['name'], [['Asha']]), expected, false).reason).toMatch(/Expected 2 columns but your query returned 1/);
    expect(compareResults(q(['name', 'sum'], expected.rows), expected, false).reason).toMatch(/"sum" but "total"/);
    expect(compareResults(q(['name', 'total'], expected.rows.slice(0, 2)), expected, false).reason).toMatch(/Expected 3 rows but your query returned 2/);
  });
  it('reports an unexpected row using only the learner value', () => {
    const r = compareResults(q(['name', 'total'], [['Asha', 100], ['Bharat', 51], ['Chitra', null]]), expected, false);
    expect(r.equal).toBe(false);
    expect(r.reason).toContain('(Bharat, 51)');
    expect(r.reason).not.toContain('50');
  });
  it('dates vs ISO strings', () => {
    expect(compareResults(q(['d'], [[new Date('2026-01-02T00:00:00Z')]]), q(['d'], [['2026-01-02']]), true).equal).toBe(true);
  });
});

describe('splitStatements', () => {
  it('splits on top-level semicolons only', () => {
    const sql = `SELECT 'a;b'; -- comment; here
SELECT "we;ird" FROM t; /* block; comment */ SELECT $$x;y$$; SELECT $tag$ ; $tag$;
-- only a comment;
`;
    expect(splitStatements(sql)).toEqual([`SELECT 'a;b'`, `-- comment; here\nSELECT "we;ird" FROM t`, `/* block; comment */ SELECT $$x;y$$`, `SELECT $tag$ ; $tag$`]);
  });
  it('handles doubled quotes, E-strings and missing final semicolon', () => {
    expect(splitStatements(`SELECT 'it''s; fine'; SELECT E'a\\';b'; SELECT 1`)).toEqual([`SELECT 'it''s; fine'`, `SELECT E'a\\';b'`, 'SELECT 1']);
    expect(splitStatements('  -- nothing\n ; ')).toEqual([]);
  });
  it('detects transaction control', () => {
    expect(hasTransactionControl('SELECT 1; COMMIT;')).toBe(true);
    expect(hasTransactionControl("SELECT 'commit'")).toBe(false);
  });
});

describe('hintForError', () => {
  it('covers the common errors', () => {
    expect(hintForError('relation "custmers" does not exist')).toMatch(/Schema tab/);
    expect(hintForError('column "nmae" does not exist')).toMatch(/no column "nmae"/);
    expect(hintForError('column c.nmae does not exist')).toMatch(/c\.nmae/);
    expect(hintForError('syntax error at or near "FORM"')).toMatch(/"FORM"/);
    expect(hintForError('syntax error at end of input')).toMatch(/ended too early/);
    expect(hintForError('division by zero')).toMatch(/NULLIF/);
    expect(hintForError('column "o.id" must appear in the GROUP BY clause or be used in an aggregate function')).toMatch(/GROUP BY/);
    expect(hintForError('something unusual')).toBeUndefined();
  });
  it('maps an error position to line and column', () => {
    expect(positionToLineCol('SELECT 1\nFROM nope', 15)).toEqual({ line: 2, column: 6 });
  });
});

describe('schema → erDiagram', () => {
  const schema = buildSchema(
    [
      { table_name: 'orders', column_name: 'id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0 },
      { table_name: 'orders', column_name: 'customer_id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0 },
      { table_name: 'orders', column_name: 'total', data_type: 'numeric', is_nullable: 'YES', character_maximum_length: null, numeric_precision: 10, numeric_scale: 2 },
      { table_name: 'customers', column_name: 'id', data_type: 'integer', is_nullable: 'NO', character_maximum_length: null, numeric_precision: 32, numeric_scale: 0 },
      { table_name: 'customers', column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO', character_maximum_length: null, numeric_precision: null, numeric_scale: null },
    ],
    [
      { table_name: 'orders', column_name: 'id', constraint_type: 'PRIMARY KEY', ref_table: null, ref_column: null },
      { table_name: 'customers', column_name: 'id', constraint_type: 'PRIMARY KEY', ref_table: null, ref_column: null },
      { table_name: 'orders', column_name: 'customer_id', constraint_type: 'FOREIGN KEY', ref_table: 'customers', ref_column: 'id' },
    ],
  );
  it('builds tables with keys and pretty types', () => {
    expect(schema.map((t) => t.name)).toEqual(['customers', 'orders']);
    expect(schema[1].columns[2].type).toBe('numeric(10,2)');
    expect(schema[0].columns[1].type).toBe('timestamptz');
    expect(schema[1].columns[1].fk).toEqual({ table: 'customers', column: 'id' });
  });
  it('produces a Mermaid erDiagram that parses', async () => {
    const src = schemaToMermaid(schema);
    expect(src).toContain('int id PK');
    expect(src).toContain('customers ||--o{ orders : "customer_id"');
    const { default: mermaid } = await import('mermaid');
    await expect(mermaid.parse(src)).resolves.toBeTruthy();
  });
});

describe('page content', () => {
  it('has 3 datasets and 10 challenges with hints, each tied to a dataset', () => {
    expect(SQL_DATASETS.map((d) => d.id)).toEqual(['shop', 'hr', 'audit']);
    expect(SQL_CHALLENGES).toHaveLength(10);
    for (const c of SQL_CHALLENGES) {
      expect(c.hints.length).toBeGreaterThan(0);
      expect(SQL_DATASETS.some((d) => d.id === c.dataset)).toBe(true);
    }
    expect(new Set(SQL_CHALLENGES.map((c) => c.id)).size).toBe(10);
  });
  it('datasets are deterministic', async () => {
    const again = await import('./datasets');
    expect(again.SQL_DATASETS[0].setupSql).toBe(SQL_DATASETS[0].setupSql);
  });
});
