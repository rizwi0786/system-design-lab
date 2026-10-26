// Parses every ```mermaid block in the given lesson files with the real mermaid parser (jsdom).
// Usage: node scripts/check-mermaid.mjs content/lessons/m06/*.md
import { JSDOM } from '../node_modules/jsdom/lib/api.js';
import { readFileSync } from 'node:fs';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
try { globalThis.navigator = dom.window.navigator; } catch {}
globalThis.DOMParser = dom.window.DOMParser;
const mermaid = (await import('../node_modules/mermaid/dist/mermaid.core.mjs')).default;
mermaid.initialize({ startOnLoad: false });
let bad = 0, n = 0;
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f, 'utf8');
  const re = /```mermaid\n([\s\S]*?)```/g; let m;
  while ((m = re.exec(src))) { n++;
    try { await mermaid.parse(m[1]); }
    catch (e) { bad++; console.log(`FAIL ${f.split('/').pop()} #${n}: ${String(e.message ?? e).slice(0,400)}`); }
  }
}
console.log(`mermaid: ${n} diagrams, ${bad} bad`);
process.exit(bad ? 1 : 0);
