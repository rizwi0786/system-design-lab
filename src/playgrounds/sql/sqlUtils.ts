// Pure SQL helpers: statement splitting, error hints, schema → Mermaid erDiagram.

/** Splits a script into statements on top-level semicolons, respecting quotes, dollar quotes and comments. Comment-only chunks are dropped. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  const n = sql.length;
  const push = (end: number) => {
    const s = sql.slice(start, end).trim();
    if (stripComments(s).trim()) out.push(s);
  };
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
    if (ch === '/' && next === '*') {
      let depth = 1; i += 2;
      while (i < n && depth) { if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; } else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; } else i++; }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const escapes = ch === "'" && (sql[i - 1] === 'E' || sql[i - 1] === 'e') && !/\w/.test(sql[i - 2] ?? '');
      i++;
      while (i < n) {
        if (escapes && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === ch) { if (sql[i + 1] === ch) { i += 2; continue; } break; }
        i++;
      }
      i++;
      continue;
    }
    if (ch === '$') {
      const m = /^\$([A-Za-z_][\w]*)?\$/.exec(sql.slice(i));
      if (m && !/\w/.test(sql[i - 1] ?? '')) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
        continue;
      }
    }
    if (ch === ';') { push(i); start = i + 1; }
    i++;
  }
  push(n);
  return out;
}

export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** A plain-English hint for common PostgreSQL errors. */
export function hintForError(message: string): string | undefined {
  const m = message.toLowerCase();
  let x: RegExpExecArray | null;
  if ((x = /relation "([^"]+)" does not exist/.exec(message))) {
    return `There is no table or view called "${x[1]}". Check the Schema tab for the exact table names — unquoted names are lower-cased, and a table created in an earlier, failed statement was rolled back.`;
  }
  if ((x = /column "?([^"\s]+)"? does not exist/.exec(message)) || (x = /column ([\w.]+) does not exist/.exec(message))) {
    return `There is no column "${x[1]}" here. Check the spelling in the Schema tab and which table it belongs to (use alias.column). Text values need single quotes — "double quotes" mean a column name.`;
  }
  if ((x = /syntax error at end of input/.exec(m))) return 'The statement ended too early — something is unfinished, such as a missing closing bracket, a trailing comma or a dangling AND.';
  if ((x = /syntax error at or near "([^"]*)"/.exec(message))) {
    return `PostgreSQL stopped understanding the query at "${x[1]}". Look just before it: a missing comma, an unclosed bracket or quote, or clauses in the wrong order (SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT).`;
  }
  if (m.includes('division by zero')) return 'A value was divided by zero. Wrap the divisor in NULLIF(divisor, 0) so the result becomes NULL instead of an error.';
  if (m.includes('must appear in the group by clause')) return 'Every selected column must either be in GROUP BY or be inside an aggregate such as COUNT(), SUM() or MAX().';
  if ((x = /column reference "([^"]+)" is ambiguous/.exec(message))) return `More than one joined table has a column "${x[1]}". Prefix it with the table name or alias, e.g. o.${x[1]}.`;
  if (m.includes('aggregate functions are not allowed in where')) return 'WHERE filters rows before grouping, so it cannot use aggregates. Move the condition to HAVING.';
  if (m.includes('window functions are not allowed in where')) return 'Window functions run after WHERE. Compute them in a subquery or CTE, then filter the outer query.';
  if (m.includes('statement timeout')) return 'The query ran longer than 5 seconds and was stopped. Look for a missing join condition (a cartesian product) or an endless recursive CTE.';
  if (m.includes('operator does not exist')) return 'The two sides of an operator have incompatible types. Cast one side, e.g. value::numeric or value::text.';
  if (m.includes('duplicate key value violates unique constraint')) return 'A row with the same key already exists. Use a different key or INSERT … ON CONFLICT DO NOTHING / DO UPDATE.';
  if (m.includes('violates foreign key constraint')) return 'The referenced row does not exist (or still has dependants when deleting). Insert the parent first or delete children first.';
  if (m.includes('violates not-null constraint')) return 'A required column was left empty. Provide a value for it.';
  if ((x = /function ([\w.]+)\(.*\) does not exist/.exec(message))) return `No function ${x[1]} accepts these argument types. Check the name, or cast the arguments explicitly.`;
  if (m.includes('more than one row returned by a subquery')) return 'A subquery used as a single value returned several rows. Use IN (…), EXISTS, or add a condition/LIMIT 1.';
  return undefined;
}

/** 1-based line/column of a 1-based character position (as in PostgreSQL error `position`). */
export function positionToLineCol(sql: string, position: number): { line: number; column: number } {
  const before = sql.slice(0, Math.max(0, position - 1));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

// ---------- schema ----------

export interface SchemaColumn { name: string; type: string; nullable: boolean; pk: boolean; fk?: { table: string; column: string } }
export interface SchemaTable { name: string; columns: SchemaColumn[] }

export interface ColumnRow { table_name: string; column_name: string; data_type: string; is_nullable: string; character_maximum_length: number | null; numeric_precision: number | null; numeric_scale: number | null }
export interface ConstraintRow { table_name: string; column_name: string; constraint_type: string; ref_table: string | null; ref_column: string | null }

const SHORT_TYPES: Record<string, string> = {
  'character varying': 'varchar', character: 'char', 'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp',
  'time without time zone': 'time', 'time with time zone': 'timetz', 'double precision': 'float8', integer: 'int', bigint: 'bigint', smallint: 'smallint', boolean: 'bool',
};

export function prettyType(r: Pick<ColumnRow, 'data_type' | 'character_maximum_length' | 'numeric_precision' | 'numeric_scale'>): string {
  const t = SHORT_TYPES[r.data_type] ?? r.data_type;
  if ((t === 'varchar' || t === 'char') && r.character_maximum_length) return `${t}(${r.character_maximum_length})`;
  if (t === 'numeric' && r.numeric_precision != null) return `numeric(${r.numeric_precision},${r.numeric_scale ?? 0})`;
  return t;
}

export function buildSchema(columns: ColumnRow[], constraints: ConstraintRow[]): SchemaTable[] {
  const tables = new Map<string, SchemaTable>();
  for (const c of columns) {
    if (!tables.has(c.table_name)) tables.set(c.table_name, { name: c.table_name, columns: [] });
    tables.get(c.table_name)!.columns.push({ name: c.column_name, type: prettyType(c), nullable: c.is_nullable === 'YES', pk: false });
  }
  for (const k of constraints) {
    const col = tables.get(k.table_name)?.columns.find((c) => c.name === k.column_name);
    if (!col) continue;
    if (k.constraint_type === 'PRIMARY KEY') col.pk = true;
    if (k.constraint_type === 'FOREIGN KEY' && k.ref_table && k.ref_column) col.fk = { table: k.ref_table, column: k.ref_column };
  }
  return [...tables.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const erIdent = (s: string) => s.replace(/[^\w]/g, '_');

/** Mermaid erDiagram for a schema. Foreign keys become one-to-many relationships (parent ||--o{ child). */
export function schemaToMermaid(tables: SchemaTable[]): string {
  const lines = ['erDiagram'];
  for (const t of tables) {
    lines.push(`  ${erIdent(t.name)} {`);
    for (const c of t.columns) {
      const keys = [c.pk && 'PK', c.fk && 'FK'].filter(Boolean).join(', ');
      lines.push(`    ${erIdent(c.type.replace(/\(.*\)/, ''))} ${erIdent(c.name)}${keys ? ' ' + keys : ''}`);
    }
    lines.push('  }');
  }
  for (const t of tables) {
    for (const c of t.columns) {
      if (!c.fk) continue;
      const card = c.nullable ? '|o--o{' : '||--o{';
      lines.push(`  ${erIdent(c.fk.table)} ${card} ${erIdent(t.name)} : "${c.name}"`);
    }
  }
  return lines.join('\n');
}

export const COLUMNS_SQL = `SELECT table_name, column_name, data_type, is_nullable, character_maximum_length, numeric_precision, numeric_scale
FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;

export const CONSTRAINTS_SQL = `SELECT tc.table_name, kcu.column_name, tc.constraint_type, ccu.table_name AS ref_table, ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')`;

/** True when a script contains transaction control that could escape a BEGIN … ROLLBACK wrapper. */
export function hasTransactionControl(sql: string): boolean {
  return splitStatements(sql).some((s) => /^\s*(begin|commit|rollback|end|abort|start\s+transaction|savepoint|release|prepare\s+transaction)\b/i.test(stripComments(s)));
}
