// End-to-end smoke test against the production build.
//   npm run build && npx vite preview --port 4173 &  node scripts/e2e-smoke.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = 'screenshots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('FAIL', msg); } else console.log('ok  ', msg); };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors };
}

const { ctx, page, errors } = await newPage();
const go = async (hash, wait = 'networkidle') => { await page.goto(base + '#' + hash, { waitUntil: wait }); await page.waitForTimeout(400); };

await go('/');
check(await page.getByRole('heading', { name: /Learn system design/ }).isVisible(), 'landing renders');
await page.screenshot({ path: `${out}/landing-light.png`, fullPage: true });

await go('/curriculum');
check(await page.getByRole('heading', { level: 1, name: 'Curriculum' }).isVisible(), 'curriculum renders');
check((await page.locator('section[id^="m"]').count()) === 20, 'curriculum shows 20 modules');

await go('/lesson/m06-strategy');
await page.getByRole('heading', { level: 1, name: 'Strategy' }).waitFor({ timeout: 20000 });
// Study mode (default): one step at a time, arrow keys move between steps.
check((await page.getByRole('heading', { level: 2 }).count()) === 1, 'study mode shows a single step');
await page.keyboard.press('ArrowRight');
check(await page.getByText(/^Step 2 of/).isVisible(), 'arrow key moves to the next step');
await page.getByRole('radio', { name: 'Full page' }).click();
await page.waitForFunction(() => document.querySelectorAll('.mermaid-svg svg').length >= 2, null, { timeout: 30000 }).catch(() => {});
const svgs = await page.locator('.mermaid-svg svg').count();
check(svgs >= 2, `strategy lesson renders mermaid as SVG (${svgs})`);
check(!(await page.getByText('This diagram could not be rendered').count()), 'no mermaid render errors');
await page.screenshot({ path: `${out}/lesson-light.png` });

// Answer the quiz correctly by reading the lesson source answers (first pass: pick option texts known correct).
const quiz = page.getByTestId('quiz');
await quiz.scrollIntoViewIfNeeded();
const correct = [1, 1, [0, 1, 3], 2, 1, 1];
const qs = quiz.getByTestId('quiz-question');
for (let i = 0; i < await qs.count(); i++) {
  const ans = Array.isArray(correct[i]) ? correct[i] : [correct[i]];
  for (const a of ans) await qs.nth(i).locator('input').nth(a).check();
}
await quiz.getByRole('button', { name: 'Submit answers' }).click();
const scoreText = await quiz.getByTestId('quiz-score').textContent();
check(/100%/.test(scoreText ?? ''), `quiz scored: ${scoreText}`);
// Mark two exercises done → lesson completes.
const ex = page.getByTestId('exercise');
await ex.nth(0).getByRole('button', { name: 'Mark as done' }).click();
await ex.nth(1).getByRole('button', { name: 'Mark as done' }).click();
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('heading', { level: 1, name: 'Strategy' }).waitFor();
check(await page.getByTestId('completion-panel').getByText('Completed ✓').isVisible(), 'lesson completion persisted after reload');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sdlp:progress') ?? '{}'));
check(stored.quiz?.['m06-strategy']?.length === 1, 'quiz attempt persisted in localStorage');

// Code editor + download.
await ex.nth(0).getByRole('button', { name: 'Open in editor' }).click();
await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 }).catch(() => {});
check(await page.locator('.monaco-editor').count() > 0, 'monaco editor loads');
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), ex.nth(0).getByRole('button', { name: 'Download .NET project' }).first().click()]);
check(!!download && download.suggestedFilename() === 'm06-strategy-ex1.zip', 'download .NET project');

for (const r of ['/dashboard', '/practice', '/patterns', '/playground', '/playground/csharp', '/playground/sql', '/playground/lld', '/playground/hld', '/playground/sim', '/playground/api', '/playground/decision', '/flashcards', '/assessments', '/projects', '/analytics', '/search?q=cache', '/settings', '/about', '/lesson/m20-capstone-c']) {
  const before = errors.length;
  await go(r);
  await page.waitForTimeout(r.includes('sql') ? 4000 : 800);
  const crashed = await page.getByText(/could not load/).count();
  check(errors.length === before && !crashed, `route ${r} has no uncaught errors${errors.length > before ? ': ' + errors.slice(before).join(' | ').slice(0, 300) : ''}`);
  await page.screenshot({ path: `${out}/route-${r.replace(/[^\w]+/g, '_')}.png` });
}
await go('/dashboard');
await page.screenshot({ path: `${out}/dashboard-light.png`, fullPage: true });

// Dark mode.
await page.evaluate(() => localStorage.setItem('sdlp:theme', JSON.stringify('dark')));
await go('/lesson/m06-strategy');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme applies');
await page.screenshot({ path: `${out}/lesson-dark.png` });
await go('/playground/hld'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/hld-dark.png` });
await go('/dashboard'); await page.screenshot({ path: `${out}/dashboard-dark.png` });
await ctx.close();

// Mobile.
const m = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.page.goto(base + '#/lesson/m06-strategy', { waitUntil: 'networkidle' });
await m.page.waitForTimeout(2500);
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 0, `no horizontal scroll at 390px (overflow ${overflow}px)`);
await m.page.screenshot({ path: `${out}/lesson-mobile.png` });
await m.page.getByRole('button', { name: 'Open navigation' }).click();
await m.page.waitForTimeout(300);
await m.page.screenshot({ path: `${out}/drawer-mobile.png` });
await m.page.goto(base + '#/', { waitUntil: 'networkidle' });
const overflow2 = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow2 <= 0, `landing has no horizontal scroll at 390px (overflow ${overflow2}px)`);
await m.page.screenshot({ path: `${out}/landing-mobile.png`, fullPage: true });
await m.ctx.close();

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures.length ? 1 : 0);
