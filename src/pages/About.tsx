import { contentStats } from '../lib/content';
import { PageHeader, Card } from '../components/ui';

export default function About() {
  const s = contentStats();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="About and limitations">What this platform does today, and what it honestly does not.</PageHeader>
      <div className="space-y-4 text-sm text-ink-2">
        <Card title="How it is built">
          <p>A static React + TypeScript single-page app. Lessons are version-controlled Markdown files validated at build time; the curriculum manifest lists {s.total} lessons in {s.modules} modules. There is no server and no account system: progress is stored in your browser.</p>
        </Card>
        <Card title="Content status">
          <p>{s.written} lessons are written; {s.reviewed} of them passed the automated content checks (required sections, diagrams, at least five exercises with hints and solutions, a quiz, flashcards, interview questions, and C# that compiles with the .NET 10 SDK). {s.planned} lessons are planned and clearly labelled so. A lesson that fails a check is shown as Draft.</p>
        </Card>
        <Card title="What runs where">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>C#</strong> is not compiled or executed by this site. Coding exercises download as .NET 10 solutions with xUnit tests that you run with <code>dotnet test</code>.</li>
            <li><strong>SQL</strong> runs on PGlite — PostgreSQL compiled to WebAssembly — inside your browser, on a throwaway database that is reset on demand. Nothing you type reaches a server.</li>
            <li><strong>HLD and LLD feedback</strong> comes from transparent rules (for example “single point of failure”), not AI. Rules flag definite errors separately from trade-offs, and your design is never judged only by how closely it matches a reference.</li>
            <li><strong>Simulators</strong> are simplified models built to show behaviour (retry storms, replication lag), not to predict real numbers.</li>
          </ul>
        </Card>
        <Card title="Known limitations">
          <ul className="list-disc space-y-1 pl-5">
            <li>Progress lives in one browser. Use Settings → Export to back it up or move devices.</li>
            <li>“Hidden” test cases are not possible in a static site: every test and solution ships to the browser. Solutions are hidden in the interface until you ask for them.</li>
            <li>Self-reported items (marking a C# exercise done, mock interview self-scores) are trusted as entered.</li>
            <li>Planned lessons show their topic outline only.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
