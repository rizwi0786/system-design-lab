// Result-set types and comparison used by "Check answer". Pure — see compare.test.ts.

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** PostgreSQL type OIDs per column, when known. */
  types?: number[];
  affectedRows?: number;
}

const NUMERIC_STRING = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** Canonical form of one cell: numbers and numeric strings → rounded number, dates → ISO string, null/undefined → null. */
export function normalizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (typeof v === 'number') return normalizeNumber(v);
  if (typeof v === 'boolean') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
  if (typeof v === 'string') {
    const t = v.trim();
    if (NUMERIC_STRING.test(t)) return normalizeNumber(Number(t));
    if (ISO_LIKE.test(t)) {
      // Date-only strings stay as dates; timestamps become UTC ISO (no offset = treated as UTC).
      if (t.length === 10) return `${t}T00:00:00.000Z`;
      const withZone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(t) ? t.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00') : t.replace(' ', 'T') + 'Z';
      const d = new Date(withZone);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return v;
  }
  if (v instanceof Uint8Array) return '\\x' + Array.from(v).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, normalizeValue(o[k])]));
  }
  return String(v);
}

function normalizeNumber(n: number): number | string {
  if (!Number.isFinite(n)) return String(n);
  if (Object.is(n, -0)) return 0;
  // 12 significant digits: 10.50 == 10.5 and AVG() float noise (3.3333333333333335) == numeric (3.3333333333333333).
  return Number(n.toPrecision(12));
}

const rowKey = (row: unknown[]) => JSON.stringify(row.map(normalizeValue));
const preview = (row: unknown[]) => {
  const s = '(' + row.map((v) => { const n = normalizeValue(v); return n === null ? 'NULL' : typeof n === 'string' ? n : JSON.stringify(n); }).join(', ') + ')';
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
};

/**
 * Compares the learner's result `a` with the expected result `b`.
 * Column names are compared case-insensitively, values are normalised, and when `ordered` is false rows are compared as a multiset.
 * The reason never shows expected values — only facts about `a` — so it cannot leak the answer.
 */
export function compareResults(a: QueryResult, b: QueryResult, ordered: boolean): { equal: boolean; reason?: string } {
  if (a.columns.length !== b.columns.length) {
    return { equal: false, reason: `Expected ${b.columns.length} column${b.columns.length === 1 ? '' : 's'} but your query returned ${a.columns.length}.` };
  }
  for (let i = 0; i < a.columns.length; i++) {
    if (a.columns[i].toLowerCase() !== b.columns[i].toLowerCase()) {
      return { equal: false, reason: `Column ${i + 1} is named "${a.columns[i]}" but "${b.columns[i]}" was expected. Use AS to rename it, and check the column order.` };
    }
  }
  if (a.rows.length !== b.rows.length) {
    return { equal: false, reason: `Expected ${b.rows.length} row${b.rows.length === 1 ? '' : 's'} but your query returned ${a.rows.length}.` };
  }
  const ak = a.rows.map(rowKey);
  const bk = b.rows.map(rowKey);
  if (ordered) {
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) {
        const sameSet = multisetEqual(ak, bk);
        return {
          equal: false,
          reason: sameSet
            ? `The rows are right but the order is not: row ${i + 1} is ${preview(a.rows[i])}. Check your ORDER BY (including tie-breakers).`
            : `Row ${i + 1} differs from the expected row. Your row: ${preview(a.rows[i])}.`,
        };
      }
    }
    return { equal: true };
  }
  const counts = new Map<string, number>();
  for (const k of bk) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (let i = 0; i < ak.length; i++) {
    const n = counts.get(ak[i]) ?? 0;
    if (n === 0) return { equal: false, reason: `Your result has a row that is not expected: ${preview(a.rows[i])}.` };
    counts.set(ak[i], n - 1);
  }
  return { equal: true };
}

function multisetEqual(a: string[], b: string[]) {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}
