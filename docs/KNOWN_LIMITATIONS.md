# Known limitations (honest list)

1. **C# is not executed in the browser.** The editor and tests are real; you run them with `dotnet test` on your own
   machine (.NET 10 SDK). The site never claims to have run your code.
2. **Data lives in one browser.** Clearing site data deletes it. The app requests persistent storage and reminds you
   to export, but the backup file is your real safety net. Different browsers/devices do not sync automatically.
3. **Solutions and "hidden" tests are reachable** by a determined learner (static site). Fine for self-study, not for certification.
4. **All 311 lessons are written and pass the automated checks** (structure, C# compile + tests, Mermaid parse,
   SQL verified in PGlite by the writers). Automated checks are not a substitute for expert human review; treat
   version-specific claims about .NET 10 / ASP.NET Core 10 and cloud pricing as "verify before relying on it".
5. **Architecture feedback is rule-based.** It catches common issues (single points of failure, direct client→DB,
   missing consumers, sync chains, cycles, god classes) and labels trade-offs separately; it cannot judge whether a
   design fits unstated requirements.
6. **Simulators are simplified, seeded models** with their assumptions listed on screen — useful for intuition, not capacity planning.
7. **Cost and latency figures** in lessons and the decision simulator are labelled estimates; check current vendor pricing.
8. **C# verification here used an xUnit stand-in** (no NuGet in the build environment). Compiled lesson code avoids
   EF Core/Npgsql/Polly/Redis clients; those appear in clearly marked uncompiled snippets.
9. **Lesson length** is often above the 6,500-word target because exercises, quizzes and interview answers are counted.
