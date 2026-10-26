# Security

## Static app (current)
- **No server, no accounts, no secrets.** Nothing is transmitted; all data stays in the learner's browser.
- **No external network calls at runtime.** Fonts, Monaco, Mermaid and PGlite are bundled.
- **Learner SQL** runs in an isolated in-memory PGlite instance per playground, with `statement_timeout = 5s`; answer
  checks run on a fresh copy inside rolled-back transactions. Nothing can reach real data.
- **Learner C#** is never executed by the site. It is downloaded as a project and run by the learner on their own machine.
- **Markdown rendering** uses react-markdown without raw HTML, so lesson text cannot inject scripts.
- **Imported backup files** are parsed as JSON and written only under the `sdlp:` prefix; they are data, never code.
- **Solutions are hidden, not secret.** In a static app the content ships to the browser; "hidden" means behind an
  explicit reveal step. Graded certification would need the backend.
- **Shared computers:** anyone using the same browser profile can see the data. Settings → Reset clears it.

## When a backend is added
Cookie auth (HttpOnly, Secure, SameSite=Lax) + antiforgery, or bearer tokens for API clients; policy-based
authorization with ownership checks; rate limiting on auth and submissions; parameterized SQL only; secrets in
Key Vault / user-secrets; audit events for login, export, import, reset; and a **sandboxed code runner**:
one container per submission, no network, read-only root FS, CPU 1, memory 512 MB, 10 s wall clock, pids limit,
non-root user, results returned via queue. Hidden tests and reference solutions never leave the server.
