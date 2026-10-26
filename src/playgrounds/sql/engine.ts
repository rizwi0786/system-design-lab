// Thin wrapper around PGlite (PostgreSQL compiled to WebAssembly). Each call to createDb gives an isolated in-memory database.
import type { PGlite } from '@electric-sql/pglite';
import { compareResults } from './compare';
import type { QueryResult } from './compare';
import { COLUMNS_SQL, CONSTRAINTS_SQL, buildSchema, hasTransactionControl, splitStatements, stripComments } from './sqlUtils';
import type { ColumnRow, ConstraintRow, SchemaTable } from './sqlUtils';

export type Db = PGlite;

const DATE = 1082;
const TIMESTAMP = 1114;
const TIMESTAMPTZ = 1184;
/** Keep dates/timestamps as PostgreSQL prints them (no local-time-zone shifting in the browser). */
const parsers = { [DATE]: (x: string) => x, [TIMESTAMP]: (x: string) => x, [TIMESTAMPTZ]: (x: string) => x };
const OPTIONS = { rowMode: 'array' as const, parsers };

export const STATEMENT_TIMEOUT = '5s';

export async function createDb(setupSql: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();
  if (setupSql.trim()) await db.exec(setupSql);
  try { await db.exec(`SET statement_timeout = '${STATEMENT_TIMEOUT}'`); } catch { /* best effort */ }
  return db;
}

export interface RunOutcome {
  result: QueryResult;
  statementCount: number;
  /** Command tag-like summary for statements that return no rows. */
  hasRows: boolean;
}

type RawResult = { rows: unknown[]; fields: { name: string; dataTypeID: number }[]; affectedRows?: number };

const toResult = (r: RawResult): QueryResult => ({
  columns: r.fields.map((f) => f.name),
  types: r.fields.map((f) => f.dataTypeID),
  rows: r.rows as unknown[][],
  affectedRows: r.affectedRows,
});

/** Runs one or more statements. Single statements use db.query, scripts use db.exec and the last result set is returned. */
export async function runSql(db: Db, sql: string): Promise<RunOutcome> {
  const statements = splitStatements(sql);
  if (!statements.length) throw new Error('Nothing to run — the editor only contains comments or whitespace.');
  if (statements.length === 1) {
    const r = await db.query(statements[0], [], OPTIONS) as RawResult;
    return { result: toResult(r), statementCount: 1, hasRows: r.fields.length > 0 };
  }
  const all = await db.exec(sql, OPTIONS) as RawResult[];
  const withRows = [...all].reverse().find((r) => r.fields.length > 0);
  const last = withRows ?? all[all.length - 1] ?? { rows: [], fields: [] };
  return { result: toResult(last), statementCount: statements.length, hasRows: !!withRows };
}

/** EXPLAIN ANALYZE of the last statement, inside a rolled-back transaction so data-changing statements leave no trace. */
export async function explainSql(db: Db, sql: string): Promise<string> {
  const statements = splitStatements(sql);
  const last = statements[statements.length - 1];
  if (!last) throw new Error('Write a query first, then press Explain.');
  const body = stripComments(last).trim();
  const query = /^explain\b/i.test(body) ? last : `EXPLAIN (ANALYZE, BUFFERS false, FORMAT TEXT) ${last}`;
  await db.exec('BEGIN');
  try {
    const r = await db.query<unknown[]>(query, [], OPTIONS);
    return r.rows.map((row) => String(row[0])).join('\n');
  } finally {
    await db.exec('ROLLBACK').catch(() => undefined);
  }
}

export async function loadSchema(db: Db): Promise<SchemaTable[]> {
  const cols = await db.query<ColumnRow>(COLUMNS_SQL);
  const cons = await db.query<ConstraintRow>(CONSTRAINTS_SQL);
  return buildSchema(cols.rows, cons.rows);
}

async function runRolledBack(db: Db, sql: string): Promise<QueryResult> {
  await db.exec('BEGIN');
  try {
    return (await runSql(db, sql)).result;
  } finally {
    await db.exec('ROLLBACK').catch(() => undefined);
  }
}

export interface CheckOutcome { passed: boolean; reason?: string; learnerError?: string }

/**
 * Runs the reference query and the learner's query against the same pristine database (each in its own
 * rolled-back transaction) and compares the result sets. The reference SQL and its rows are never returned.
 * Returns whether `db` must be discarded (the learner's SQL contained transaction control).
 */
export async function checkAnswer(db: Db, learnerSql: string, solutionSql: string, ordered: boolean): Promise<CheckOutcome & { dirty: boolean }> {
  const dirty = hasTransactionControl(learnerSql);
  let expected: QueryResult;
  try {
    expected = await runRolledBack(db, solutionSql);
  } catch (e) {
    return { passed: false, reason: `The reference query failed to run (${errorMessage(e)}). This is a problem with the exercise, not your answer.`, dirty };
  }
  let actual: QueryResult;
  try {
    actual = await runRolledBack(db, learnerSql);
  } catch (e) {
    return { passed: false, reason: 'Your query raised an error.', learnerError: errorMessage(e), dirty };
  }
  if (!actual.columns.length) return { passed: false, reason: 'Your SQL did not return a result set. The answer must end with a query that returns rows (SELECT, WITH … SELECT, VALUES).', dirty };
  const cmp = compareResults(actual, expected, ordered);
  return { passed: cmp.equal, reason: cmp.reason, dirty };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
