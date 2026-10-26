// Builds a runnable .NET 10 solution (app + xUnit tests) for a code exercise, entirely in the browser.
import JSZip from 'jszip';
import type { CodeFile } from './lessonParser';

export const XUNIT_VERSION = '2.9.3';
export const XUNIT_RUNNER_VERSION = '3.1.4';
export const TEST_SDK_VERSION = '17.14.1';

export function appCsproj(): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>Exe</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <!-- Lets exercises use Microsoft.Extensions.* (DI, Options, Logging, Caching) and ASP.NET Core types. -->
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
</Project>
`;
}

export function testsCsproj(): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
    <IsTestProject>true</IsTestProject>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="${TEST_SDK_VERSION}" />
    <PackageReference Include="xunit" Version="${XUNIT_VERSION}" />
    <PackageReference Include="xunit.runner.visualstudio" Version="${XUNIT_RUNNER_VERSION}" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="../../src/App/App.csproj" />
  </ItemGroup>
  <ItemGroup>
    <Using Include="Xunit" />
  </ItemGroup>
</Project>
`;
}

/** Starter files often have no entry point (library-style); add one so the App project builds as an Exe. */
export function needsEntryPoint(files: CodeFile[]): boolean {
  const hasMain = files.some(f => /static\s+(async\s+)?(void|int|Task|Task<int>)\s+Main\s*\(/.test(f.code));
  const hasTopLevel = files.some(f => {
    if (!/(^|\/)Program\.cs$/.test(f.name)) return false;
    const first = f.code.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('//') && !l.startsWith('using ') && !l.startsWith('#'));
    return !!first && !/^(namespace|public|internal|sealed|static|partial|class|record|interface|abstract|enum|struct|file|\[)/.test(first);
  });
  return !hasMain && !hasTopLevel;
}

const ENTRY = `// Added by System Design Lab so the project builds as a console app.
// Use it to experiment: dotnet run --project src/App
public static class __Entry
{
    public static void Main() => System.Console.WriteLine("Starter project builds. Run the tests with: dotnet test");
}
`;

function safeName(name: string): string {
  return name.replace(/\\/g, '/').split('/').map(p => p.replace(/[^\w.-]/g, '_')).filter(p => p && p !== '..').join('/') || 'File.cs';
}

export interface ProjectInput { title: string; exerciseId: string; files: CodeFile[]; tests: CodeFile[]; lessonId: string; description?: string; acceptance?: string[] }

export function projectFiles(p: ProjectInput): Record<string, string> {
  const out: Record<string, string> = {};
  const root = safeName(p.exerciseId);
  out[`${root}/src/App/App.csproj`] = appCsproj();
  const csFiles = p.files.filter(f => ['csharp', 'cs', 'c#'].includes(f.language) || f.name.endsWith('.cs'));
  for (const f of csFiles) out[`${root}/src/App/${safeName(f.name)}`] = f.code;
  if (needsEntryPoint(csFiles)) out[`${root}/src/App/__Entry.cs`] = ENTRY;
  if (p.tests.length) {
    out[`${root}/tests/App.Tests/App.Tests.csproj`] = testsCsproj();
    for (const t of p.tests) out[`${root}/tests/App.Tests/${safeName(t.name)}`] = t.code;
  }
  out[`${root}/README.md`] = readme(p, root);
  out[`${root}/.gitignore`] = 'bin/\nobj/\n.vs/\n*.user\nTestResults/\n';
  return out;
}

function readme(p: ProjectInput, root: string): string {
  return `# ${p.title}

Exercise \`${p.exerciseId}\` from the lesson \`${p.lessonId}\` in System Design Lab.

${p.description ?? ''}

${p.acceptance?.length ? '## Acceptance criteria\n\n' + p.acceptance.map(a => `- ${a}`).join('\n') + '\n' : ''}
## Run it

Requires the .NET 10 SDK (https://dotnet.microsoft.com/download).

\`\`\`bash
cd ${root}
dotnet test tests/App.Tests        # runs the exercise tests (they fail until you implement the starter)
dotnet run --project src/App       # optional: run the app project
\`\`\`

Edit the files in \`src/App\` until every test passes. The tests are the same ones shown in the lesson.
System Design Lab does not run C# in the browser — this project is how you execute and test your code.
`;
}

export async function buildProjectZip(p: ProjectInput): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(projectFiles(p))) zip.file(path, content);
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
