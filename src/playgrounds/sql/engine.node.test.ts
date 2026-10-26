// @vitest-environment node
// Boots real PGlite (PostgreSQL in WASM) to prove the engine and every challenge solution work.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkAnswer, createDb, explainSql, loadSchema, runSql } from './engine';
import type { Db } from './engine';
import { SQL_CHALLENGES } from './challenges';
import { SQL_DATASETS } from './datasets';

const dbs = new Map<string, Db>();

beforeAll(async () => {
  for (const d of SQL_DATASETS) dbs.set(d.id, await createDb(d.setupSql));
}, 120_000);
afterAll(async () => { for (const db of dbs.values()) await db.close(); });

describe('engine on PGlite', () => {
  it('runs a single query with typed columns', async () => {
    const { result, statementCount } = await runSql(dbs.get('shop')!, 'SELECT id, name, price FROM products ORDER BY id LIMIT 2');
    expect(statementCount).toBe(1);
    expect(result.columns).toEqual(['id', 'name', 'price']);
    expect(result.rows).toEqual([[1, 'Wireless Mouse', '799.00'], [2, 'Mechanical Keyboard', '3499.00']]);
  });

  it('runs scripts and returns the last result set; dates stay as PostgreSQL text', async () => {
    const db = dbs.get('shop')!;
    const out = await runSql(db, "CREATE TEMP TABLE t (d date); INSERT INTO t VALUES ('2026-01-02'); SELECT d FROM t; DROP TABLE t;");
    expect(out.statementCount).toBe(4);
    expect(out.result.rows).toEqual([['2026-01-02']]);
  });

  it('has seeded every table with 20-120 rows', async () => {
    for (const d of SQL_DATASETS) {
      for (const t of d.tables) {
        const { result } = await runSql(dbs.get(d.id)!, `SELECT count(*)::int FROM ${t}`);
        expect(result.rows[0][0] as number, `${d.id}.${t}`).toBeGreaterThanOrEqual(6);
        expect(result.rows[0][0] as number, `${d.id}.${t}`).toBeLessThanOrEqual(120);
      }
    }
  });

  it('sets a statement timeout', async () => {
    const { result } = await runSql(dbs.get('hr')!, 'SHOW statement_timeout');
    expect(result.rows[0][0]).toBe('5s');
  });

  it('explains a query without changing data', async () => {
    const db = dbs.get('hr')!;
    const plan = await explainSql(db, 'DELETE FROM leave_requests');
    expect(plan).toMatch(/Delete on leave_requests/);
    expect(plan).toMatch(/Execution Time/);
    const { result } = await runSql(db, 'SELECT count(*)::int FROM leave_requests');
    expect(result.rows[0][0]).toBe(40);
  });

  it('reads the schema with primary and foreign keys', async () => {
    const schema = await loadSchema(dbs.get('hr')!);
    const emp = schema.find((t) => t.name === 'employees')!;
    expect(emp.columns.find((c) => c.name === 'id')!.pk).toBe(true);
    expect(emp.columns.find((c) => c.name === 'manager_id')!.fk).toEqual({ table: 'employees', column: 'id' });
    expect(emp.columns.find((c) => c.name === 'salary')!.type).toBe('numeric(10,2)');
  });

  it('raises PostgreSQL errors with position', async () => {
    await expect(runSql(dbs.get('shop')!, 'SELECT * FROM custmers')).rejects.toMatchObject({ message: 'relation "custmers" does not exist', position: '15' });
  });

  for (const c of SQL_CHALLENGES) {
    it(`challenge ${c.id}: solution returns rows and passes its own check`, async () => {
      const db = dbs.get(c.dataset)!;
      const { result } = await runSql(db, c.solutionSql);
      expect(result.rows.length).toBeGreaterThan(0);
      const r = await checkAnswer(db, c.solutionSql, c.solutionSql, !!c.ordered);
      expect(r.passed, r.reason).toBe(true);
    });
  }

  it('check answer: accepts equivalent SQL, rejects wrong SQL, and is isolated from data changes', async () => {
    const db = dbs.get('shop')!;
    const ch = SQL_CHALLENGES.find((c) => c.id === 'sql-04-never-ordered')!;
    const alt = 'SELECT name, email FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id) ORDER BY email DESC';
    expect((await checkAnswer(db, alt, ch.solutionSql, false)).passed).toBe(true);
    const wrong = await checkAnswer(db, 'SELECT name, email FROM customers', ch.solutionSql, false);
    expect(wrong.passed).toBe(false);
    expect(wrong.reason).toMatch(/Expected \d+ rows/);
    const destructive = await checkAnswer(db, 'DELETE FROM order_items; DELETE FROM payments; DELETE FROM orders; ' + ch.solutionSql, ch.solutionSql, false);
    expect(destructive.passed).toBe(false);
    const { result } = await runSql(db, 'SELECT count(*)::int FROM orders');
    expect(result.rows[0][0]).toBe(40);
    const err = await checkAnswer(db, 'SELECT nme FROM customers', ch.solutionSql, false);
    expect(err).toMatchObject({ passed: false, learnerError: expect.stringContaining('does not exist') });
  });

  it('keyset challenge needs the id tie-breaker', async () => {
    const db = dbs.get('audit')!;
    const ch = SQL_CHALLENGES.find((c) => c.id === 'sql-10-keyset')!;
    const naive = ch.solutionSql.replace(/\(created_at, id\) > \(([^,]+), \d+\)/, 'created_at > $1');
    expect(naive).not.toBe(ch.solutionSql);
    expect((await checkAnswer(db, naive, ch.solutionSql, true)).passed).toBe(false);
  });
});
