# System Design Lab

An interactive course that takes you from zero to advanced in software architecture, low-level design (LLD) and
high-level design (HLD), using C#, ASP.NET Core and PostgreSQL.

It is a **static web app**: no server, no login. Everything you do (progress, quiz attempts, notes, code edits,
saved designs) is kept in your browser, and you can export a full backup file and restore it anywhere.

## What is inside

| Area | What you get |
|---|---|
| Curriculum | 20 modules, 311 lessons — all written, each passing the content validator, C# compile/test checks and Mermaid parsing. |
| Lesson format | Objectives → beginner explanation → first principles → Mermaid diagrams → step-by-step example → compilable C# → bad vs good design → playground → 5+ exercises with progressive hints and hidden solutions → tests → real-world use → interview Q&A → flashcards → quiz → completion criteria |
| Playgrounds | C# editor (Monaco) with "download as .NET project"; SQL on real PostgreSQL in your browser (PGlite); HLD architecture canvas with rule-based review; LLD class designer (generates Mermaid + C#); 10 distributed-systems simulators; API contract designer with lint and breaking-change detection; architecture decision simulator |
| Learning engine | Completion only after passing the quiz and finishing 2 exercises; mastery score; weak-topic detection; prerequisite-aware recommendations; spaced-repetition flashcards; mock exams and timed mock interviews |
| Your data | Settings → **Export full backup** / **Restore from backup** (replace or merge). The app asks the browser for persistent storage so it is not evicted. |

## Run it locally

Requirements: Node.js 22+. For running C# exercises: .NET 10 SDK.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests (vitest)
npm run build      # validates content, type-checks, builds to dist/
npx vite preview   # serve the production build
```

Deploy `dist/` to any static host (GitHub Pages, IIS static site, Azure Static Web Apps, Nginx). The build uses
relative paths and hash routing, so it works from a sub-folder.

## Content tooling

```bash
npm run content                                   # build manifest + validate every lesson
node scripts/cs-check.ts <lessonId>               # compile lesson C#, run exercise tests against starter + solution
node scripts/cs-check-all.ts                      # all lessons (slow)
node scripts/check-mermaid.mjs content/lessons/*/*.md   # parse every diagram
```

Authoring rules: `docs/CONTENT_MODEL.md`. Writer brief: `docs/WRITER_BRIEF.md`.

## Docs

`docs/PRODUCT_REQUIREMENTS.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `API_SPECIFICATION.md`,
`SECURITY.md`, `CONTENT_MODEL.md`, `IMPLEMENTATION_PLAN.md`, `TESTING.md`, `DEPLOYMENT.md`, `KNOWN_LIMITATIONS.md`.
