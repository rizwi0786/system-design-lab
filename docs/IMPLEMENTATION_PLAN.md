# Implementation plan and status

| Phase | Scope | Status |
|---|---|---|
| 1 Requirements & architecture | PRD, curriculum manifest (20 modules / 311 lessons), architecture, content model | Done |
| 2 Foundation | Vite + React + TS + Tailwind, routing, layout, theme, storage wrapper, tests | Done |
| 3 Curriculum engine | Parser, validator, manifest, reader, navigation, prerequisites, search, notes, bookmarks, progress | Done |
| 4 Assessments | Quizzes, exercises, hints, solutions, completion rules, mock exams, mock interviews | Done |
| 5 Playgrounds | C#, SQL (PGlite), LLD, HLD, API, simulators, decision simulator | Done |
| 6 Projects & case studies | Projects page; 20 HLD + 20 LLD case studies; 3 capstones + DDD project | Done |
| 7 Personalisation | Recommendations, SRS, weak topics, mastery | Done |
| 8 Hardening | Backup/restore, persistent storage, accessibility, verification scripts | Done for static scope |
| 9 Curriculum completion | All 311 lessons across 20 modules | Done — every lesson passes validator, C# and Mermaid checks |

## Content status
All 20 modules are fully written (311 lessons). `npm run content` reports 0 validation failures.

## Adding the backend later (optional)
1. Create `server/` ASP.NET Core 10 modular monolith with Identity + PostgreSQL per `DATABASE_DESIGN.md` §2.
2. Implement `/api/v1/me/import` accepting the existing backup format so learners migrate by uploading their file.
3. Swap `lib/storage.ts` for a sync adapter (local-first, push on change).
4. Add the sandboxed runner (`SECURITY.md`) and switch the C# playground's "Run tests" from download to submit.
