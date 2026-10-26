// Offline C# verification for lesson content.
//   node scripts/cs-check.ts <lessonId|path.md> [--keep]
// For each lesson it checks:
//   1. IMPL     : all ```csharp file=... blocks in the lesson body (outside directives) compile together.
//   2. PLAY     : every :::playground type=csharp compiles (and runs, with a 10s limit).
//   3. STARTER  : each code exercise's ::starter + ::tests compile (tests may fail — that is expected).
//   4. SOLUTION : starter files overridden by ::solution blocks that carry file=... compile and ALL tests pass.
// xUnit is replaced by scripts/csharp-shim/XunitShim.cs because this environment has no NuGet access.
// The ASP.NET Core shared framework is referenced, so Microsoft.Extensions.* (DI, Options, Logging,
// Caching.Memory, Hosting) and ASP.NET Core types are available. EF Core / Npgsql / Polly are NOT.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseLesson, extractCodeFiles, type CodeFile } from '../src/lib/lessonParser.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const keep = process.argv.includes('--keep');
if (!arg) { console.error('usage: node scripts/cs-check.ts <lessonId|file.md>'); process.exit(2); }

function findLesson(a: string): string {
  if (a.endsWith('.md')) return a;
  for (const m of readdirSync(join(root, 'content/lessons'))) {
    const f = join(root, 'content/lessons', m, `${a}.md`);
    if (existsSync(f)) return f;
  }
  throw new Error(`lesson ${a} not found`);
}

const file = findLesson(arg);
const src = readFileSync(file, 'utf8');
const lesson = parseLesson(src);
const work = join('/tmp/cs-check', `${lesson.meta.id}-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const shim = readFileSync(join(root, 'scripts/csharp-shim/XunitShim.cs'), 'utf8');

const csproj = (opts: { exe: boolean; startup?: string }) => `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>${opts.exe ? 'Exe' : 'Library'}</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <NoWarn>CS1591;CS8618;CS0169;CS0414;CS0649;CS1998;CS8321;CA2254;ASP0000</NoWarn>
    ${opts.startup ? `<StartupObject>${opts.startup}</StartupObject>` : ''}
  </PropertyGroup>
</Project>`;

let failures = 0;
function build(name: string, files: CodeFile[], opts: { exe: boolean; startup?: string; run?: boolean; expectPass?: boolean }) {
  const dir = join(work, name.replace(/[^\w.-]/g, '_'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Check.csproj'), csproj(opts));
  writeFileSync(join(dir, 'nuget.config'), '<?xml version="1.0"?><configuration><packageSources><clear /></packageSources></configuration>');
  const used = new Set<string>();
  for (const f of files) {
    let n = f.name.replace(/[\\/]/g, '_');
    while (used.has(n)) n = '_' + n;
    used.add(n);
    writeFileSync(join(dir, n), f.code);
  }
  try {
    execFileSync('dotnet', ['build', '-nologo', '-v', 'q', '-clp:NoSummary;ErrorsOnly'], { cwd: dir, stdio: 'pipe', timeout: 180_000 });
  } catch (e) {
    const out = String((e as { stdout?: Buffer }).stdout ?? '') + String((e as { stderr?: Buffer }).stderr ?? '');
    const errs = [...new Set(out.split('\n').filter(l => /error/.test(l)).map(l => l.replace(dir + '/', '').replace(/\s*\[.*\]$/, '').trim()))].slice(0, 15);
    console.log(`FAIL  ${name}: compile errors\n      ${errs.join('\n      ')}`);
    failures++;
    return;
  }
  if (!opts.run) { console.log(`OK    ${name}: compiles`); return; }
  let out = '';
  let code = 0;
  try { out = execFileSync('dotnet', ['run', '--no-build'], { cwd: dir, stdio: 'pipe', timeout: 20_000 }).toString(); }
  catch (e) { out = String((e as { stdout?: Buffer }).stdout ?? ''); code = (e as { status?: number }).status ?? 1; }
  const result = out.split('\n').find(l => l.startsWith('RESULT')) ?? '';
  if (opts.expectPass) {
    if (code === 0 && result) console.log(`OK    ${name}: ${result}`);
    else { failures++; console.log(`FAIL  ${name}: ${result || 'did not run'}\n      ${out.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 10).join('\n      ')}`); }
  } else console.log(`OK    ${name}: compiles; ${result || 'ran (exit ' + code + ')'}`);
}

// 1. Implementation blocks in the lesson body.
const bodyFiles: CodeFile[] = [];
for (const s of lesson.sections) for (const b of s.blocks) if (b.type === 'markdown')
  for (const f of extractCodeFiles(b.text)) if ((f.language === 'csharp' || f.language === 'cs') && f.explicitName) bodyFiles.push(f);
const implFiles = bodyFiles.filter(f => f.language === 'csharp' || f.language === 'cs');
if (implFiles.length) {
  const hasTopLevel = implFiles.some(f => f.name.endsWith('Program.cs'));
  build('IMPL', implFiles, { exe: hasTopLevel });
} else console.log('NOTE  IMPL: no ```csharp file=... blocks in lesson body');

// 2. Playgrounds.
let pi = 0;
for (const s of lesson.sections) for (const b of s.blocks) if (b.type === 'playground' && b.kind === 'csharp' && b.files.length) {
  pi++;
  build(`PLAY${pi}`, b.files.filter(f => f.language === 'csharp' || f.language === 'cs'), { exe: true, run: true });
}

// 3/4. Exercises.
for (const ex of lesson.exercises) {
  if (ex.kind !== 'code' || !ex.starter.length) continue;
  const tests = ex.tests.length ? ex.tests : [];
  const shimFile = { name: '__XunitShim.cs', language: 'csharp', code: shim };
  build(`STARTER ${ex.id}`, [...ex.starter, ...tests, shimFile], { exe: true, startup: '__ShimRunner', run: tests.length > 0 });
  const solFiles = extractCodeFiles(ex.solution).filter(f => f.explicitName && (f.language === 'csharp' || f.language === 'cs'));
  if (solFiles.length && tests.length) {
    const merged = ex.starter.map(f => solFiles.find(s => s.name === f.name) ?? f);
    for (const s of solFiles) if (!merged.includes(s)) merged.push(s);
    build(`SOLUTION ${ex.id}`, [...merged, ...tests, shimFile], { exe: true, startup: '__ShimRunner', run: true, expectPass: true });
  } else if (tests.length) console.log(`NOTE  SOLUTION ${ex.id}: no ::solution blocks with file=<starter file name>; solution not machine-verified`);
}

if (!keep) rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} C# check(s) failed for ${lesson.meta.id}` : `\nAll C# checks passed for ${lesson.meta.id}`);
process.exit(failures ? 1 : 0);
