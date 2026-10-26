# Testing

| Layer | Command | What it proves |
|---|---|---|
| Unit + component | `npm test` | Parser and validator, progress/completion/mastery/recommendations, SRS, search, API lint, decision formulas, project zip, backup/restore, HLD/LLD rules, simulator models, SQL result comparison, lesson reader render |
| Real PostgreSQL | included in `npm test` (`engine.node.test.ts`) | PGlite boots, queries, EXPLAIN, timeouts, all SQL challenge solutions pass the checker |
| Content | `npm run content` | Every lesson has the required sections, ≥5 exercises across levels, quiz ≥5, flashcards ≥5, interview Qs at 3 levels, ≥1 diagram, valid prerequisite ids |
| C# | `node scripts/cs-check.ts <id>` / `cs-check-all.ts` | Lesson `file=` blocks compile together; playgrounds compile and run; each exercise starter + tests compile; each solution passes all its tests |
| Diagrams | `node scripts/check-mermaid.mjs content/lessons/*/*.md` | Every Mermaid diagram parses |
| End-to-end | `node scripts/e2e-smoke.mjs` (after `npx vite preview`) | Main routes load without errors, diagrams render, quiz progress persists across reload |

Note: the C# checker uses `scripts/csharp-shim/XunitShim.cs` (a small xUnit-compatible runner) because the build
environment has no NuGet access. Downloaded learner projects use the real xUnit packages.
