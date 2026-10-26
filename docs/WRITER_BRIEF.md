# Brief for lesson writers

You are writing lessons for a system-design learning platform (HLD + LLD, C# / ASP.NET Core / PostgreSQL).
The repo is at /home/claude/sdlp.

## Before writing
1. Read `docs/CONTENT_MODEL.md` fully — it is the contract the parser and validator enforce.
2. Read `content/lessons/m06/m06-strategy.md` — the quality bar and format reference. Match its depth,
   structure and tone. Do NOT copy its examples; each lesson needs its own fresh, realistic scenario.
3. Look up lesson ids in `content/curriculum.txt`. `prerequisites` and `related` may ONLY use ids that
   exist there. Link to other lessons in prose as `[Title](#/lesson/<id>)`.

## Audience and voice
- Learner may be a beginner. Plain English first, then the correct technical term in brackets,
  e.g. "a waiting line for messages (message queue)". Use analogies and concrete numbers.
- Concise sentences, no filler, no repetition to pad length. English only.
- Indian context is welcome in examples (₹, UPI, GST, Indian cities, infrastructure projects) but keep it natural and mixed with global examples.
- Be technically accurate and current (.NET 10, C# 14, ASP.NET Core 10, PostgreSQL 17). Never invent benchmark
  numbers; label estimates as estimates. Don't claim to know a company's proprietary architecture —
  say "a system like X" and reason from public engineering principles.
- Always discuss trade-offs, failure modes, and when a simpler alternative is better.

## Required for each lesson
- Exact `##` section headings for its template (see CONTENT_MODEL §2). Pattern/concept lessons use
  `template: lesson`; Module 17 uses `hld-case`; Module 18 uses `lld-case`.
- 2,500–5,000 words of prose (validator minimum is 1,800; code doesn't count).
- ≥2 Mermaid diagrams (class + sequence for patterns; architecture + sequence for HLD), each explained in prose.
  Mermaid must be valid syntax: in classDiagram use `~T~` for generics, avoid `<`/`>` in member names,
  quote labels with special characters in flowcharts (`A["Load balancer (L7)"]`).
- ≥5 exercises (≥2 beginner, ≥2 intermediate, ≥1 advanced), each with ≥3 progressive hints (aim for 4–6:
  nudge → direction → approach → pseudocode/diagram → partial code), acceptance bullets, full solution,
  common mistakes. Mix kinds: `code` (C# with starter + xUnit tests), `design` (LLD), `hld`, `sql`, `written`.
  At least 2 `code` exercises per pattern/LLD lesson; HLD lessons should include ≥1 `hld` or `sql` exercise and ≥1 `code` exercise where a C# implementation makes sense (e.g. a cache-aside service, token bucket, idempotent consumer).
- For every `code` exercise: `::starter` must be COMPLETE compilable C# (stubs throw NotImplementedException),
  no top-level statements (use classes; a `Main` is optional), `::tests` are xUnit tests that compile against
  the starter, and `::solution` contains the FULL solution file(s) as ```csharp file=<same name as the starter file>
  so the checker can swap them in and run the tests. Avoid target-typed `new(...)` inside params arrays.
  Only BCL + Microsoft.Extensions.* + ASP.NET Core types are available to the checker (no EF Core, Npgsql,
  Polly, Moq, FluentAssertions). Write hand-rolled fakes instead of Moq.
- One `:::playground` (csharp for patterns/LLD; hld / sql / sim for HLD topics — see CONTENT_MODEL §6).
- `:::quiz pass=70` with 6–8 questions (scenario-based, not trivia), each with an explanation.
- 6–10 flashcards. Interview questions: ≥2 beginner, ≥2 intermediate, ≥2 advanced, with model answers.
- Production-style implementation: `csharp file=...` blocks forming a coherent compilable set
  (namespaces, interfaces, implementations, DI registration in Program.cs). The checker compiles all
  `file=` blocks in the lesson body together as ONE project, so file names and type names must not clash
  across sections, and every `file=` block must compile. Snippets that are deliberately partial or "bad
  design" examples must NOT have a `file=` attribute.
- `references:` in frontmatter — official docs (learn.microsoft.com, postgresql.org, redis.io, rabbitmq.com,
  kafka.apache.org, martinfowler.com, original papers, refactoring.guru-level sources), 2–5 per lesson.

## Verify (mandatory, for every lesson)
```bash
cd /home/claude/sdlp
node scripts/build-content.ts --only <lessonId> | grep -A30 "<lessonId>"   # must print OK
node scripts/cs-check.ts <lessonId>                                          # must print "All C# checks passed"
```
Fix every problem and re-run until both pass. Then set `status: reviewed` in the frontmatter.
If you genuinely cannot make something pass, leave `status: draft` and say why in your final report.

## Rules
- Only create/edit your assigned lesson files under `content/lessons/<module>/`. Do not modify any other file.
- Final reply: a short table — lesson id, words, exercises, validator OK?, C# check OK? — plus any issues.

## Extra rules (learned from the first batch)
- Never delete or batch-edit files you don't own. Never `rm -rf /tmp/cs-check` (other writers share it).
  Put scratch files in a uniquely named subfolder of your scratchpad.
- YAML: quote any frontmatter string containing a colon (e.g. reference titles).
- If `cs-check` fails with an MSBuild/obj/"did not run" error unrelated to your code, re-run it once —
  the machine is shared and busy.
- Validate Mermaid by parsing (mandatory): `node scripts/check-mermaid.mjs content/lessons/<module>/<lessonId>.md` must report 0 bad.
- Target 4,000–6,500 words by the validator's count (it includes exercises, quiz and interview text).

## HLD lessons (Modules 9–17)
- Use concrete back-of-the-envelope numbers (show the arithmetic: e.g. 10 M DAU × 20 req/day ÷ 86,400 s ≈ 2,300 RPS average, ×3 for peak ≈ 7,000 RPS).
- Diagrams: Mermaid `flowchart LR` architecture diagrams + `sequenceDiagram` for key flows; explain every arrow.
- Always cover: what breaks first under load, failure modes and mitigation, consistency trade-offs, cost drivers, and "when a simpler design is enough".
- C#: show how the idea is implemented in ASP.NET Core where it makes sense (e.g. HybridCache/IDistributedCache cache-aside, idempotency middleware, outbox relay as BackgroundService, token-bucket limiter, consistent-hash ring, Raft-style term/vote logic as a simplified model). Library types that aren't available offline (StackExchange.Redis, RabbitMQ.Client, Confluent.Kafka, Npgsql, Polly) may appear only in snippets WITHOUT `file=`; compiled code must use in-memory fakes behind interfaces.
- Exercises: include `kind=hld` exercises whose `::starter` holds an HLD graph ```json (CONTENT_MODEL §6) and whose solution includes a reference graph ```json plus reasoning; and `kind=sql` exercises for data-model topics (with `::setup` and `::check`). Practical playground should be `type=hld` (with a starter graph), `type=sim` (pick the matching simulator), or `type=sql`.
- hld-case lessons (Module 17): follow the hld-case template; the "Practical playground" must be `type=hld` with a reasonable starting graph (not the full answer), and one exercise must be "design it yourself" (`kind=hld`) with the reference architecture JSON in the solution.
