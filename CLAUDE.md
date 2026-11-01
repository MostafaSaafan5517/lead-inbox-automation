# Lead Inbox Automation: rules for Claude

Public portfolio repo. An AI lead inbox built twice, in n8n (self-hosted) and in Make.com (Free plan), sharing one contract in `schema/`, `prompts/` and `src/`.

## Rules
- English only, in code, docs, data and commit messages.
- No em dashes (U+2014) in any file. Use commas, periods, colons or parentheses.
- Demo data only. Every test message is invented, uses an `@example.com` address and a fictional name, and its subject starts with `[DEMO]`. No real people or companies.
- Never commit secrets: no API keys, webhook secrets, OAuth tokens or `.env` files. `.env.example` holds variable names only. Secrets live in the n8n or Make credentials store.
- Node 20+ and no runtime dependencies. Use built-ins only (`node:test`, `fetch`, `node:fs`).
- Run `npm test` before every commit and only commit when it passes.
- Keep `src/cleanup.js` small and dependency-free so it can be pasted into an n8n Code node. After changing it, run `node scripts/build-n8n-code.mjs` to regenerate `dist/n8n-cleanup-snippet.js` (git-ignored).
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`), authored by Mostafa Saafan, no AI attribution or trailers.
- Never push, create remotes or call external APIs without Mostafa's OK.
