import JSZip from 'jszip';
import { projectFiles, buildProjectZip, needsEntryPoint, XUNIT_VERSION } from '../projectZip';

const input = {
  title: 'Buy 2 get 1', exerciseId: 'm06-strategy-ex1', lessonId: 'm06-strategy',
  files: [{ name: 'BuyXGetYStrategy.cs', language: 'csharp', code: 'public class B {}' }],
  tests: [{ name: 'Tests.cs', language: 'csharp', code: 'public class T {}' }],
  acceptance: ['works'],
};

describe('project zip', () => {
  it('lays out an app and a test project', () => {
    const files = projectFiles(input);
    expect(Object.keys(files).sort()).toEqual([
      'm06-strategy-ex1/.gitignore', 'm06-strategy-ex1/README.md', 'm06-strategy-ex1/src/App/App.csproj',
      'm06-strategy-ex1/src/App/BuyXGetYStrategy.cs', 'm06-strategy-ex1/src/App/__Entry.cs',
      'm06-strategy-ex1/tests/App.Tests/App.Tests.csproj', 'm06-strategy-ex1/tests/App.Tests/Tests.cs',
    ]);
    expect(files['m06-strategy-ex1/src/App/App.csproj']).toContain('<TargetFramework>net10.0</TargetFramework>');
    expect(files['m06-strategy-ex1/src/App/App.csproj']).toContain('Microsoft.AspNetCore.App');
    const t = files['m06-strategy-ex1/tests/App.Tests/App.Tests.csproj'];
    expect(t).toContain(`Include="xunit" Version="${XUNIT_VERSION}"`);
    expect(t).toContain('xunit.runner.visualstudio');
    expect(t).toContain('Microsoft.NET.Test.Sdk');
    expect(t).toContain('ProjectReference Include="../../src/App/App.csproj"');
    expect(files['m06-strategy-ex1/README.md']).toContain('dotnet test');
  });
  it('does not add an entry point when one exists', () => {
    expect(needsEntryPoint([{ name: 'Program.cs', language: 'csharp', code: 'public static class P { public static void Main() {} }' }])).toBe(false);
    expect(needsEntryPoint([{ name: 'Program.cs', language: 'csharp', code: 'using System;\nvar x = 1;\nConsole.WriteLine(x);' }])).toBe(false);
    expect(needsEntryPoint([{ name: 'A.cs', language: 'csharp', code: 'namespace X; public class A {}' }])).toBe(true);
  });
  it('sanitises file names', () => {
    const files = projectFiles({ ...input, files: [{ name: '../../evil.cs', language: 'csharp', code: '' }] });
    expect(Object.keys(files).some(k => k.includes('..'))).toBe(false);
  });
  it('builds a zip blob', async () => {
    const blob = await buildProjectZip(input);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('m06-strategy-ex1/tests/App.Tests/Tests.cs')).not.toBeNull();
  });
});
