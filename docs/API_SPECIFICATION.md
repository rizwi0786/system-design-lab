# API specification

## Current
There is no server API. The app's internal API is the TypeScript module surface:

| Module | Main functions |
|---|---|
| `lib/content.ts` | `modules`, `allLessons`, `writtenLessons`, `lessonById(id)`, `loadLesson(id)` |
| `lib/progress.ts` | `useProgress()`, `actions.*` (visit, quizAttempt, exercise, hint, note, bookmark, srs, complete, importState, reset), `recommendations()`, `weakTopics()`, `dueCards()`, mastery helpers |
| `lib/backup.ts` | `exportAll()`, `parseBackup(json)`, `importAll(json, mode)`, `requestPersistentStorage()`, `daysSinceExport()` |
| `lib/search.ts` | build index, `search(q)` |

## Planned ASP.NET Core API (when a backend is added)
All endpoints under `/api/v1`, JSON, ProblemDetails errors, cookie auth with CSRF protection or bearer tokens,
ownership checks on every learner resource, cursor pagination on lists.

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/register, /auth/login, /auth/logout | Account (ASP.NET Core Identity) |
| GET | /curriculum | Manifest |
| GET | /lessons/{id} | Lesson content (no hidden tests/solutions) |
| PUT | /me/progress/lessons/{id} | Visit/complete state |
| POST | /me/quiz-attempts | Submit quiz; server scores |
| POST | /me/submissions | Submit code → queued to sandbox; returns 202 + Location |
| GET | /me/submissions/{id} | Result (compile output, test results) |
| GET/PUT | /me/notes/{lessonId}, /me/bookmarks | Notes and bookmarks |
| GET/PUT | /me/diagrams/{key} | Versioned designs (If-Match for optimistic concurrency) |
| GET | /me/recommendations, /me/analytics | Learning engine |
| GET/POST | /me/export, /me/import | Same backup format as the static app |
