# Content model and authoring guide

All course content is version-controlled Markdown under `content/lessons/<moduleId>/<lessonId>.md`.
The list of modules and lessons lives in `content/curriculum.txt`. `npm run content` parses every
lesson, validates it, and writes `src/generated/curriculum.json`, which the app reads.

A lesson listed in `curriculum.txt` without a file is shown as **Planned**. A file that fails
validation is shown as **Draft**, whatever its frontmatter says. Only a passing file can show its
declared status (`reviewed`, `tested`, `published`).

## 1. File layout

```
---
id: m06-strategy                 # must equal the file name
title: Strategy
module: m06                      # must equal the folder name
level: beginner                  # beginner | intermediate | advanced
status: reviewed                 # planned | draft | reviewed | tested | published
template: lesson                 # lesson | lld-case | hld-case | capstone
minutes: 60
prerequisites: [m01-interfaces-abstract, m04-ocp]   # lesson ids from curriculum.txt only
related: [m06-state, m06-template-method]
tags: [behavioral, gof]
patterns: [Strategy]             # pattern names this lesson teaches (feeds the Pattern Atlas)
summary: One or two sentences shown in cards and search results.
references:
  - title: Microsoft Learn — Dependency injection in .NET
    url: https://learn.microsoft.com/dotnet/core/extensions/dependency-injection
---

Optional intro paragraph.

## Learning objectives
...
```

Use `##` (H2) only for the required sections below. Use `###` and deeper freely inside them.

## 2. Required sections by template

The validator checks these H2 headings exist (spelling must match; case and punctuation are normalised).

**lesson** (concept and pattern lessons)
Learning objectives · Prerequisites · Explain it like I'm a beginner · First-principles explanation ·
Visual explanation · Step-by-step example · Production-style C# implementation · Bad design vs good design ·
Practical playground · Exercises · Automated testing · Real-world application · Interview questions ·
Summary and revision · Knowledge check · Completion criteria

**lld-case** (Module 18)
Learning objectives · Prerequisites · Explain it like I'm a beginner · Requirements ·
Identifying classes and responsibilities · Class diagram · Patterns and design decisions · State transitions ·
C# implementation · Automated testing · Bad design vs good design · Alternative designs · Practical playground ·
Exercises · Interview questions · Summary and revision · Knowledge check · Completion criteria

**hld-case** (Module 17)
Learning objectives · Prerequisites · Explain it like I'm a beginner · Requirements · Capacity estimation ·
API design · Data model · High-level architecture · Deep dives · Caching, queues and scaling · Failure handling ·
Security · Observability · Deployment and cost · Alternatives and trade-offs · Practical playground · Exercises ·
Interview questions · Summary and revision · Knowledge check · Completion criteria

**capstone** (Module 20)
Learning objectives · Prerequisites · Project brief · Deliverables · Milestones · Reference architecture ·
Evaluation rubric · Exercises · Summary and revision · Knowledge check · Completion criteria

## 3. Other validation rules

- At least one ` ```mermaid ` diagram, and every diagram is followed by prose explaining it.
- At least one ` ```csharp ` block (except hld-case and capstone, where it is recommended).
- At least 5 exercises: ≥2 beginner, ≥2 intermediate, ≥1 advanced. Each has a description, `::acceptance`
  bullets, ≥3 `::hint` entries (up to 6, ordered from nudge to near-solution), and a `::solution`.
- A `:::quiz` with at least 5 questions, every question with an explanation.
- At least 5 flashcards.
- Interview questions at all three levels.
- At least 1,800 words of prose (code blocks are not counted). Aim for 2,500–5,000 for major lessons.

## 4. Directive blocks

Directives start with `:::name attrs` on their own line and end with a line containing only `:::`.
Subsections inside a directive start with `::name` on their own line. Directive and subsection markers
inside code fences are ignored, so code can contain anything.

### Callout
```
:::callout type=warning title="Do not do this in production"
Markdown text. type = note | tip | warning | tradeoff | mistake
:::
```

### Exercise
```
:::exercise id=m06-strategy-ex1 difficulty=beginner kind=code title="Add a festival discount"
Description in Markdown (everything before the first ::subsection).
::requirements
Markdown.
::acceptance
- Bullet one
- Bullet two
::hint
Conceptual nudge.
::hint
More specific direction.
::hint
Approach / pseudocode.
::starter
```csharp file=Program.cs
// Compilable starter code. Stubs throw NotImplementedException.
```
::tests
```csharp file=DiscountTests.cs
// xUnit tests that compile against the starter's public types.
```
::solution
Markdown explanation plus the full solution code.
::alternatives
Other valid designs and when they are better.
::mistakes
- Common mistake one
::extensions
Stretch goals.
:::
```

`kind` = `code` (C# — downloadable as a runnable dotnet solution with xUnit tests), `design`
(LLD — can be opened in the LLD designer), `hld` (open in the HLD canvas), `sql` (runs in the
in-browser PostgreSQL playground), `written` (free-text answer, self-assessed against the rubric).

For `kind=sql`, add `::setup` (a ```sql block creating and seeding tables) and `::check` (a ```sql
reference query). The playground runs the learner's query and the reference query against the same
fresh database and compares result sets. Add `ordered=true` to the exercise line if row order matters.

### Quiz
```
:::quiz pass=70
::q single
Which statement is true?
- [ ] Wrong option
- [x] Right option
> Explanation shown after answering.
::q multi
Select all that apply.
- [x] A
- [ ] B
- [x] C
> Explanation.
:::
```

### Flashcards
```
:::flashcards
Q: Front of the card
A: Back of the card (may continue on following lines)
:::
```

### Interview questions
```
:::interview
::q beginner
Question text
::a
Model answer in Markdown.
::q intermediate
...
:::
```

### Playground embed
```
:::playground type=csharp title="Try it"
```csharp file=Program.cs
// Opens in the Monaco editor and can be downloaded as a dotnet project.
```
:::
```
`type` = `csharp` | `sql` | `lld` | `hld` | `sim`. For `sql`, put a ```sql block with setup statements;
for `sim`, add `sim=cache|queue|retry|ratelimit|replication|circuit|scaling|partition`.

## 5. Writing standards

- Start every concept with a plain-English explanation and a real-world analogy, then give the technical
  term in brackets — for example "a stand-in object (Proxy)".
- Use concrete numbers in examples.
- C# targets .NET 10 and C# 14 features only where they help. Code that claims to be complete must
  compile. Use file-scoped namespaces and nullable reference types.
- Every pattern lesson covers: original problem, simplest implementation, participants, class diagram,
  sequence diagram where relevant, ASP.NET Core use case, testing, when not to use, comparison with
  similar patterns, and a refactoring exercise.
- Never invent benchmark results. Label estimates as estimates.
- Do not claim to describe a company's proprietary internal architecture.

## 6. Playground data formats

### HLD graph (`:::playground type=hld` with a ```json block, and `kind=hld` exercises)
```json
{
  "nodes": [
    { "id": "c", "type": "client", "label": "Mobile app", "props": { "rps": 2000 } },
    { "id": "lb", "type": "load-balancer", "label": "ALB" },
    { "id": "api", "type": "app-server", "label": "API", "props": { "instances": 3 } },
    { "id": "db", "type": "database", "label": "PostgreSQL", "props": { "replicas": 1 } }
  ],
  "edges": [
    { "from": "c", "to": "lb", "kind": "sync" },
    { "from": "lb", "to": "api", "kind": "sync" },
    { "from": "api", "to": "db", "kind": "sync", "label": "SQL" }
  ]
}
```
Node `type` is one of: `client`, `dns`, `cdn`, `load-balancer`, `api-gateway`, `app-server`, `worker`,
`database`, `read-replica`, `cache`, `queue`, `stream`, `object-storage`, `search`, `monitoring`,
`external`, `websocket-gateway`, `scheduler`, `rate-limiter`, `service-registry`.
Common `props`: `instances` (number), `replicas` (number), `rps` (client traffic), `region` (string),
`multiAz` (boolean), `latencyMs` (number), `ttlSeconds` (cache). Edge `kind` is `sync` or `async`.

### LLD class model (`:::playground type=lld` with a ```json block, and `kind=design` exercises)
```json
{
  "classes": [
    { "id": "IDiscountStrategy", "name": "IDiscountStrategy", "kind": "interface",
      "fields": [], "methods": ["decimal Calculate(Order order)"] },
    { "id": "Pct", "name": "PercentageOffStrategy", "kind": "class",
      "fields": ["-decimal _percent"], "methods": ["+decimal Calculate(Order order)"],
      "responsibility": "Computes a percentage discount" }
  ],
  "relations": [ { "from": "Pct", "to": "IDiscountStrategy", "kind": "implements" } ]
}
```
Class `kind`: `class`, `abstract`, `interface`, `record`, `enum`. Relation `kind`: `inherits`,
`implements`, `composition`, `aggregation`, `association`, `dependency`. Optional relation `label`
and `multiplicity` (e.g. `"1..*"`).

### SQL (`:::playground type=sql`)
A ```sql block of setup statements (CREATE TABLE + INSERT). The learner gets an editor against a fresh
in-browser PostgreSQL (PGlite) seeded with that script.

### Simulators (`:::playground type=sim sim=<name>`)
`sim` = `cache` | `queue` | `retry` | `ratelimit` | `replication` | `circuit` | `scaling` | `partition` |
`loadbalancer` | `consistent-hash`. Optional attrs set initial parameters, e.g. `hitRatio=0.8`.
