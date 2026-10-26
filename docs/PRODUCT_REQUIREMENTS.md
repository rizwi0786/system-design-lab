# Product requirements

## Goal
Take a learner with little or no system-design background to the point where they can design, implement, test,
explain and review real systems — at both the class level (LLD) and the system level (HLD) — using C#, ASP.NET Core
and PostgreSQL. Useful for day-to-day engineering and for system-design interviews.

Teaching loop: **Understand → Visualize → Implement → Test → Break → Improve → Design independently.**

## Decision log
- **Static app first (chosen by the product owner).** No backend, no accounts. Progress lives in browser storage with
  full export/import. A backend can be added later behind the same `progress`/`storage` API (see `IMPLEMENTATION_PLAN.md`).
- **Content priority:** design patterns + LLD, then HLD, to full depth; other modules listed as planned until written.

## Users and journeys
1. **Beginner** — lands, reads "how the course works", starts Module 1, reads a lesson, takes the quiz, does two
   exercises, gets the next recommendation.
2. **Interview preparer** — goes to Practice / Assessments, filters HLD case studies, runs timed mock interviews,
   reviews weak topics on Analytics.
3. **Working engineer** — opens the Pattern Atlas, reads one pattern, downloads the .NET exercise project, runs
   `dotnet test` locally.
4. **Multi-device learner** — exports a backup on a laptop, restores it on another browser.

## Functional requirements
| ID | Requirement | Status |
|---|---|---|
| F1 | Curriculum explorer: Course → Module → Lesson with search and filters (track, level, status, completion) | Done |
| F2 | Lesson reader following the 16-section template, with TOC, diagrams, code, notes, bookmarks, prev/next | Done |
| F3 | Exercises with 3–6 progressive hints, solution hidden until requested, hint usage recorded (never penalised) | Done |
| F4 | Quizzes with explanations, attempts history, pass mark | Done |
| F5 | Lesson completion = quiz passed + 2 exercises done (opening a page never completes it) | Done |
| F6 | C# playground (Monaco) + downloadable .NET 10 solution with xUnit tests | Done (runs locally — see limitations) |
| F7 | SQL playground on real PostgreSQL (PGlite), seeded datasets, EXPLAIN, schema diagram, auto-checked exercises | Done |
| F8 | HLD canvas with configurable components, sync/async edges, rule-based review separating errors from trade-offs | Done |
| F9 | LLD class designer with graph model, Mermaid + C# generation, design feedback, reference comparison | Done |
| F10 | Distributed-systems simulators (cache, queue, retry, rate limit, replication, circuit, scaling, partition, LB, consistent hash) | Done |
| F11 | API designer with lint, OpenAPI export, breaking-change detection | Done |
| F12 | Architecture decision simulator with labelled estimates | Done |
| F13 | Spaced-repetition flashcards, mock exams, mock interviews | Done |
| F14 | Dashboard and analytics from real records only; mastery formula shown | Done |
| F15 | Full-text search across lessons, exercises, patterns | Done |
| F16 | Full data backup/restore (replace or merge), persistent-storage request, backup reminders | Done |
| F17 | Pattern Atlas: every GoF, enterprise, concurrency, resilience, messaging, cloud and architectural pattern + anti-patterns | Done |
| F18 | Capstones A/B/C with deliverables and rubrics | Done |

## Non-functional requirements
- Works offline after first load except for nothing (no external calls at runtime).
- Responsive down to 360 px; keyboard accessible; light and dark themes.
- No fake statistics, no placeholder buttons; unwritten lessons are clearly marked Planned.
- Every lesson file passes the validator; every compiled C# block builds; every exercise solution passes its tests;
  every Mermaid diagram parses.
