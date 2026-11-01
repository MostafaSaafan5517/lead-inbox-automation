# Make.com version

Two scenarios on the Make.com Free plan, built from the same contract as the n8n version (`schema/`, `prompts/`, `test-data/`).

| File | Scenario | What it does |
|---|---|---|
| `process-lead.blueprint.json` | B, "Process lead" | Custom webhook, secret check, input check, duplicate check, Gemini classify, one repair, Dead Letter, routing by category |
| `email-intake.blueprint.json` | A, "Email intake" | Gmail watch, then POST of the normalized message to Scenario B's webhook |
| `BUILD-GUIDE.md` | both | Click-by-click build guide, filter formulas, error handlers, credit estimate |

## Status of the blueprints: NOT VERIFIED

The two blueprint files are **hand-written drafts**. They have not been imported into the Make editor yet.

- The overall format (`name`, `flow`, `metadata`, routers with `routes`, error handlers in `onerror`, connections in `__IMTCONN__`) follows a published example blueprint. Module identifiers such as `google-email:createDraft`, `http:MakeRequest`, `util:SetVariables`, the module versions and the mapper field names are **best guesses** and may need fixing.
- Filter operator names (`text:pattern`, `exist`, ...) and the Retry handler settings (`builtin:Break` with `count` and `interval`) are also guesses.
- If an import fails or a module comes in empty, build that module by hand with `BUILD-GUIDE.md`. The guide is the reference, the drafts are a shortcut.
- **The blueprints committed at the end will be the ones exported from the working scenarios**, replacing these drafts.

## Before committing an exported blueprint

An export from Make contains account-specific values. Before committing it:

1. Replace the webhook secret in both "Secret" filters with `PASTE_WEBHOOK_SECRET_IN_EDITOR`.
2. Replace the spreadsheet id in the `spreadsheet_id` variable with `PASTE_SPREADSHEET_ID`, and the webhook URL in Scenario A with `PASTE_WEBHOOK_URL`.
3. Set every `__IMTCONN__`, `hook`, `apiKeyKeychain` and data structure `type` value to `null`.
4. Run `npm test`. `test/make-blueprints.test.js` fails if a secret-looking string, a connection id, an em dash or prompt drift is left in either file.

No API key, webhook secret or OAuth token is ever written into these files. The Gemini key and the webhook secret that Scenario A sends live in Make keychains (HTTP module, API key authentication). Scenario B compares the secret in two filters, so the value is typed into those filters in the editor only, and step 1 above removes it from any export. Gmail and Google Sheets use Make connections.
