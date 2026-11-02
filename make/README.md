# Make.com version

Two scenarios on the Make.com Free plan, built from the same contract as the n8n version (`schema/`, `prompts/`, `test-data/`). Both were built and tested in a Make account on 2026-11-02, then exported. The files here are those exports with account values replaced by placeholders.

| File | Scenario | What it does |
|---|---|---|
| `process-lead.blueprint.json` | "Process lead" | Custom webhook, secret check, input check, duplicate check on Leads, Gemini classify, Dead Letter rows, routing by category |
| `email-intake.blueprint.json` | "Email intake" | Gmail watch (search filter), then POST of each new email to the Process lead webhook |
| `data-structures.json` | both | The three data structures the blueprints use. Create them before the import. |
| `BUILD-GUIDE.md` | both | Import steps, every module explained, settings, test results, credits |

## Import in short

Full steps in [BUILD-GUIDE.md](BUILD-GUIDE.md).

1. Create the three data structures from `data-structures.json`.
2. Create the connections: Google Sheets, Gmail, and an HTTP "API key" connection for Gemini with placement **In the header** and parameter name `x-goog-api-key`.
3. Import `process-lead.blueprint.json` first. Copy its webhook URL.
4. Import `email-intake.blueprint.json` and paste that URL in place of `PASTE_PROCESS_LEAD_WEBHOOK_URL`.
5. Replace every placeholder (table below), remap the connections and data structures Make asks about.
6. Scenario settings in both: **Process data in order** No, **Store incomplete executions** Yes.
7. Keep both scenarios **off** outside tests and demos (credits, see the build guide).

## Placeholders

| Placeholder | Where | What to put there |
|---|---|---|
| `PASTE_WEBHOOK_SECRET_IN_EDITOR` | Process lead: the 3 filters after the "Check request" router (4 conditions). Email intake: the `X-Webhook-Secret` header of module 2 | Your webhook secret, typed in the editor only |
| `PASTE_SPREADSHEET_ID` | Process lead: every Google Sheets module (11 places) | The id from the Sheet URL, the part between `/d/` and `/edit` |
| `PASTE_ALERT_EMAIL` | Process lead: "Hot: alert email" | The demo inbox's own address |
| `PASTE_HOT_LABEL_ID`, `PASTE_COLD_LABEL_ID`, `PASTE_SUPPORT_LABEL_ID`, `PASTE_JUNK_LABEL_ID` | Process lead: the four "label" modules | Pick the label `HOT`, `COLD`, `SUPPORT` or `JUNK` from the list |
| `PASTE_PROCESS_LEAD_WEBHOOK_URL` | Email intake: module 2 URL | The Process lead webhook URL |

The numeric connection ids, the webhook (hook) id and the data structure ids in the files are from the demo account. They are not secrets, and they do not work in another account: Make asks you to pick your own connections on import, and the data structures must exist first.

## Before committing a new export

An export from Make contains account-specific values. Before committing one:

1. Pretty-print it with 2-space indentation.
2. Put back every placeholder above: the webhook secret (4 filter conditions and the email intake header), the spreadsheet id, the alert address, the four Gmail label ids (they look like `Label_` plus digits) and the webhook URL.
3. Run `npm test`. `test/make-blueprints.test.js` fails on a secret-looking string, a Make webhook URL, a Google Sheets URL, a Gmail label id, an em dash, an unknown module, an Add a row without `RAW` values, or prompt drift.

No API key or OAuth token is in these files. The Gemini key lives in the Make HTTP connection, and Gmail and Google Sheets use Make connections. The webhook secret is typed into the scenario filters and the email intake header in the editor, so it is part of the scenario in your Make account and must be replaced before an export is committed (step 2).
