# Deployment

`npm run build` produces `dist/` — plain static files with relative paths and hash routing.

- **GitHub Pages:** push `dist/` to a `gh-pages` branch (or use `actions/deploy-pages`). No base-path config needed.
- **IIS:** create a site pointing at `dist/`. Add MIME types if missing: `.wasm` → `application/wasm`, `.data` →
  `application/octet-stream`, `.mjs` → `text/javascript`. No URL rewrite needed (hash routing).
- **Nginx / Azure Static Web Apps / any CDN:** serve `dist/` as is. Set long cache headers on `assets/*` (hashed names)
  and no-cache on `index.html`.

Size: ~56 MB total, mostly PGlite (WASM PostgreSQL), Monaco and Mermaid, all lazy-loaded; first page load is small.

## Backup and restore (learner data)
Learner data never reaches the server. Each learner uses **Settings → Export full backup** and **Restore from backup**.
Changing domains changes browser storage origin, so tell learners to export before you move the site.
