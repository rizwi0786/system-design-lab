// Runs scripts/cs-check.ts for every lesson file and prints a summary table.
//   node scripts/cs-check-all.ts [--module m06]
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onlyModule = process.argv.includes('--module') ? process.argv[process.argv.indexOf('--module') + 1] : null;
const lessonsDir = join(root, 'content/lessons');
const ids: string[] = [];
for (const m of readdirSync(lessonsDir)) {
  if (onlyModule && m !== onlyModule) continue;
  const dir = join(lessonsDir, m);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.md')) ids.push(f.replace(/\.md$/, ''));
}
ids.sort();
const rows: { id: string; ok: boolean; summary: string }[] = [];
for (const id of ids) {
  const r = spawnSync(process.execPath, [join(root, 'scripts/cs-check.ts'), id], { encoding: 'utf8', timeout: 900_000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const lines = out.split('\n');
  const ok = r.status === 0;
  const counts = { ok: lines.filter(l => l.startsWith('OK')).length, fail: lines.filter(l => l.startsWith('FAIL')).length, note: lines.filter(l => l.startsWith('NOTE')).length };
  rows.push({ id, ok, summary: `${counts.ok} ok, ${counts.fail} failed, ${counts.note} notes` });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(42)} ${counts.ok} ok, ${counts.fail} failed, ${counts.note} notes`);
  if (!ok) for (const l of lines.filter(l => l.startsWith('FAIL') || l.startsWith('      '))) console.log('      ' + l.trim());
}
const failed = rows.filter(r => !r.ok).length;
console.log(`\n${rows.length} lessons checked, ${rows.length - failed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
