// Browser smoke test: opens a sample of lessons and every main route on a running `vite preview` (port 4173),
// counts rendered diagrams and reports uncaught page errors.  Usage: node scripts/smoke-lessons.mjs
import { chromium } from '../node_modules/playwright/index.mjs';
const base = process.env.BASE ?? 'http://localhost:4173';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(p.url() + ' :: ' + e.message));
const lessons = ['m01-git', 'm05-state-diagrams', 'm09-indexes', 'm13-consensus', 'm17-chat', 'm20-capstone-b', 'm15-ci-cd', 'm03-health-shutdown'];
for (const id of lessons) {
  await p.goto(`${base}/#/lesson/${id}`);
  await p.waitForTimeout(5000);
  const svgs = await p.locator('main svg').count();
  const bad = await p.getByText(/could not render|could not be rendered|diagram error/i).count();
  console.log(id.padEnd(24), 'svg elements', svgs, 'diagram errors', bad);
}
for (const r of ['/', '/curriculum', '/patterns', '/practice', '/assessments', '/projects', '/analytics', '/settings', '/playground/sql', '/playground/hld', '/playground/lld', '/playground/sim']) {
  await p.goto(`${base}/#${r}`);
  await p.waitForTimeout(2500);
}
await p.goto(`${base}/#/`);
await p.waitForTimeout(1500);
await p.screenshot({ path: 'screenshots/landing-final.png' });
console.log('page errors:', errs.length, errs.slice(0, 5));
await b.close();
process.exit(errs.length ? 1 : 0);
