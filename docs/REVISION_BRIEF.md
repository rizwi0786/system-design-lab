# Revision brief (2026-10): real-life examples and senior review

This brief is for whoever revises existing lessons. Read `docs/WRITER_BRIEF.md` and `docs/CONTENT_MODEL.md` first;
everything there still applies. `content/lessons/m04/m04-srp.md` is the reference for a finished revision.

## 1. Replace construction / civil-engineering scenarios

Earlier lessons leaned on one domain: road and infrastructure projects (highways, culverts, chainage, BOQ / bill of
quantities, RA / running-account bills, measurement books, site engineers, site offices, contractors and
sub-contractors, tenders, PMC, concrete pours, embankments, bitumen, NHAI packages, labour gangs). Most learners
have never seen these, so the example gets in the way of the idea.

Replace them with everyday scenarios anyone understands, and **vary the domain between lessons**:
online shopping, food delivery, ride-hailing, UPI / bank payments and wallets, movie, train and flight tickets,
hotel booking, hospital and clinic appointments, pharmacy, school / college / online courses, streaming and music,
social media and chat, gym memberships, libraries, parcel delivery, SaaS tools (Jira/Slack-style), job portals.
Indian context (₹, UPI, GST, Indian cities) is welcome, mixed with global examples.

Rules:

- **Keep the scenario consistent across the whole lesson**: prose, Mermaid diagrams, C# code (type, method, variable,
  namespace and file names), exercises (requirements, acceptance, hints, starter, tests, solutions, mistakes),
  playground, quiz, flashcards, interview answers and summary.
- **Recompute every number** that depends on the old example (test assertions, acceptance criteria, quiz answers,
  capacity estimates). Numbers must be realistic for the new domain.
- **Never change** lesson `id`s or exercise `id`s (learner progress is stored under them), `##` headings, or the
  lesson's teaching goals. Keep depth and length; do not shorten.
- Passing mentions (one word in a list) just need the word swapped for an everyday one.
- Generic programming words are fine and must stay: "concrete class", "Bridge" as a networking term, "builder",
  "contract" as in API/interface contract, "survey" as in user survey, "pipeline".

## 2. Senior-engineer review (do this for every lesson, even ones with no construction content)

Read the lesson as a principal engineer with 20 years of .NET, distributed-systems and interviewing experience:

- **Correctness**: fix wrong statements, wrong numbers, wrong complexity, wrong HTTP / SQL / PostgreSQL behaviour,
  misleading advice. Target .NET 10, C# 14, ASP.NET Core 10, PostgreSQL 17. Replace obsolete APIs
  (e.g. `Startup.cs`-only guidance, `WebClient`, `BinaryFormatter`, `IHostingEnvironment`, Polly v7 syntax when
  `Microsoft.Extensions.Resilience` fits) and outdated claims.
- **Production realism**: trade-offs, failure modes, when NOT to use it, what it costs. Add a sentence or short
  section where a senior reviewer would say "you forgot X" (idempotency, timeouts, observability, security,
  data migration, cost) — only where it genuinely belongs in this lesson.
- **Clarity**: plain English first, then the term. Cut filler and repetition.
- **Irrelevant material**: remove tangents that do not help this course's goal (C# / ASP.NET Core / PostgreSQL
  application architecture, LLD and HLD). Do not remove required sections.
- **Links**: these lessons were removed and must not be linked or listed in `prerequisites`/`related`:
  m06-prototype, m06-object-pool, m06-bridge, m06-flyweight, m06-iterator, m06-memento, m06-visitor,
  m06-interpreter. New lessons you may link to where relevant: m04-solid-in-practice, m17-scaling-journey,
  m17-unique-id-generator, m17-proximity-service, m17-flash-sale, m17-web-crawler, m17-job-scheduler,
  m18-lru-cache, m18-splitwise.

Don't churn: if a passage is correct and clear, leave it.

## 3. Verify every lesson you touch

```bash
npx tsx scripts/build-content.ts --only <lessonId>     # must print OK for the lesson
npx tsx scripts/cs-check.ts <lessonId>                  # must end "All C# checks passed" (lessons with C#)
node scripts/check-mermaid.mjs content/lessons/<mod>/<lessonId>.md   # 0 bad
```

`--only` rewrites `src/generated/curriculum.json` with a partial manifest; that is expected and is regenerated
afterwards with `npm run content`. Do not run git commands that change state (no stash, checkout, reset, commit).
Only edit the lesson files you were assigned (plus their own new files if you were asked to create lessons).

## 4. No company branding

Replace any real company name left in examples (for example "rodic" in media types, e-mail domains, namespaces or
URLs) with neutral fictional names such as `example.com`, `Contoso`, `CityCare` or `QuickCart`.
