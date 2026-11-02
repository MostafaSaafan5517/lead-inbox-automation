# Make.com build guide

How to set up the Make.com version of the lead inbox on the **Free plan** from the two exported blueprints, and what each module does. It sets up two scenarios:

- **"Process lead"** (`process-lead.blueprint.json`): receives one message on a webhook, checks it, asks Gemini and routes the answer by category. Import this one first, because Email intake needs its webhook URL.
- **"Email intake"** (`email-intake.blueprint.json`): watches the demo Gmail inbox and posts each new email to Process lead.

Both blueprints are exports from scenarios that were built and tested in a Make account on 2026-11-02 (results in Part 6). Where the Make version behaves differently from the n8n version, Part 8 says so.

## Free plan limits

Checked on the account's Subscription page on 2026-11-02:

| Limit | Value |
|---|---|
| Price | $0 |
| Credits | 1,000 per month |
| Active scenarios | 2 |
| Minimum scheduling interval | 15 minutes |
| Execution time | 5 minutes |
| File size | 5 MB |
| Log storage | 7 days |

That is why there are exactly two scenarios, why Process lead is triggered instantly by a webhook, and why Email intake (the only polling scenario) stays off outside tests and demos (Part 7).

## Part 1: Before you start

1. The demo Gmail account, signed in in your browser.
2. A Make.com Free account.
3. The Google Sheet with three tabs, `Leads`, `Dead Letter` and `Run Log`, with the header rows from `test-data/sheet-headers/`. Keep the column order: the duplicate check reads `message_id` from **column E** of Leads, and every Add a row module writes the columns in that order.
4. The Gmail labels `HOT`, `COLD`, `SUPPORT` and `JUNK` in the demo inbox.
5. A Gemini API key from Google AI Studio, signed in as the demo account, no billing. Keep it in your password manager.
6. A long random webhook secret (for example 40 random letters and digits). Keep it in your password manager and in your local `.env` as `WEBHOOK_SECRET`. Never commit it.

## Part 2: Data structures and connections

### Data structures (create first)

Open **Data structures** in the left menu and create the three structures listed in `make/data-structures.json`, with the same names and fields (`spec` lists each field with its type; `collection` and `array` fields hold the nested fields):

| Name | Used by |
|---|---|
| `Lead Inbox: Gemini request` | Process lead, module 8 "Gemini classify" (HTTP request body) |
| `Lead Inbox: AI lead` | Process lead, module 9 "Parse AI answer" (Parse JSON) |
| `Lead Inbox email to webhook body` | Email intake, module 2 "Send to Process lead webhook" (HTTP request body) |

The `demo_id` values are the ids in the demo account. Your ids will differ, so after the import, pick your structure in each of those three modules.

### Connections

Make stores these in your account; nothing secret goes into the repo.

1. **Google Sheets**: sign in with the demo account.
2. **Gmail**: sign in with the demo account. Both scenarios use the same Gmail connection.
3. **Gemini**: an HTTP connection of type **API key**. Value: your Gemini key. Placement: **In the header**. Parameter name: `x-goog-api-key`. With placement "query parameters", Gemini answered `400` in the test.

## Part 3: Import the blueprints

1. **Process lead first.** Create a scenario, open the `...` menu at the bottom of the editor, choose **Import Blueprint** and pick `make/process-lead.blueprint.json`. Make asks you to pick a connection for each Google Sheets, Gmail and HTTP module; choose the ones from Part 2.
2. Open module 1 ("Lead webhook") and create or pick a webhook. Turn on **Get request headers**: the secret filters read the request headers (NOT VERIFIED whether the import keeps this setting, so check it). Copy the webhook URL. It goes into your local `.env` as `WEBHOOK_URL` and into Email intake. It is not a password, but keep it out of the repo.
3. Replace the placeholders in Process lead:
   - `PASTE_WEBHOOK_SECRET_IN_EDITOR`: your webhook secret, in the 3 filters after the "Check request" router (4 conditions in total).
   - `PASTE_SPREADSHEET_ID`: your Sheet id, in every Google Sheets module (10 Add a row modules and the "Read Leads message ids" URL).
   - `PASTE_ALERT_EMAIL`: the demo inbox's own address, in "Hot: alert email".
   - `PASTE_HOT_LABEL_ID`, `PASTE_COLD_LABEL_ID`, `PASTE_SUPPORT_LABEL_ID`, `PASTE_JUNK_LABEL_ID`: in the four label modules, pick the matching label from the list.
   - Modules 8 and 9: pick the data structures from Part 2.
4. **Email intake second.** Create another scenario and import `make/email-intake.blueprint.json`. Pick the Gmail connection. In module 2, replace `PASTE_PROCESS_LEAD_WEBHOOK_URL` with the webhook URL from step 2, `PASTE_WEBHOOK_SECRET_IN_EDITOR` in the `X-Webhook-Secret` header with your secret, and pick the third data structure.
5. Scenario settings (gear icon at the bottom of the editor), in **both** scenarios:
   - **Process data in order**: **No**. With Yes, one incomplete execution blocks every new webhook run, and the webhook answers a plain `Accepted` instead of the `202` JSON answer.
   - **Store incomplete executions**: **Yes**. The Retry error handlers need it.
6. Save both. Keep them **off** until you test (Part 7).

## Part 4: Process lead, module by module

Module numbers are the ids in the blueprint (the number in the bubble on each module).

### Check the request

1. **Lead webhook** (Custom webhook): receives the JSON body of the web form or of Email intake.
2. **Check request** (Router), three routes:
   - **Respond 403** (module 3), filter "Wrong or missing secret": the `x-webhook-secret` header is not equal to the secret. Body `{"error":"forbidden"}`. A missing header is also "not equal", so it is rejected.
   - **Respond 400** (module 4), filter "Secret ok, empty message": secret ok, and both `subject` and `body` do not exist. Then **Dead Letter: bad input** (module 5) adds a Dead Letter row with stage `normalize` and the key `<message_id>:normalize` (`make-execution:normalize` when there is no message id).
   - **Normalize** (module 30, Set multiple variables), filter "Secret ok, has content": secret ok, and `subject` or `body` exists. It sets `msgid` (the given `message_id`, else `form-` plus the time in milliseconds), `source` (`form` when empty) and `body` (cut to 4,000 characters).

### Classify

3. **Respond 202** (module 6): `{"message_id":"..."}`. The caller gets its answer now; the rest runs after it.
4. **Read Leads message ids** (module 7, Google Sheets, Make an API call): `GET spreadsheets/<id>/values/Leads!E2:E`, the `message_id` column.
5. **Gemini classify** (module 8, HTTP, Make a request), filter "Not already in Leads": the message id is not in the list from module 7 (the filter compares `,id,` against the joined column, so a key never matches part of another key). A duplicate stops here. The request:
   - URL `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent`. This is the only place the model id is set. Check it against the current Flash-Lite id in Google AI Studio.
   - Authentication: the Gemini API key connection (header `x-goog-api-key`).
   - Body built from the data structure `Lead Inbox: Gemini request`: the system prompt from `prompts/classify.md`, the user template with the message fields, `responseMimeType` `application/json`, `maxOutputTokens` 512, `temperature` 0.2.
   - Parse response Yes, non-2xx answers are errors (so a `429` or `503` goes to the Retry handler).
6. **Parse AI answer** (module 9, Parse JSON) with the data structure `Lead Inbox: AI lead`. If the answer is not valid JSON, its error handler route adds a Dead Letter row (**Dead Letter: bad AI output**, module 90, stage `parse`) and then **Skip** (the `builtin:Ignore` directive).

### Route by category

7. **Route by category** (Router), five routes:

| Route | Filter | Modules, in order |
|---|---|---|
| Hot | category = `hot_lead` | reply draft, Leads row, alert email to `PASTE_ALERT_EMAIL`, Run Log row, HOT label |
| Cold | category = `cold_lead` | reply draft, Leads row, Run Log row, COLD label |
| Support | category = `support` | reply draft, Leads row, Run Log row, SUPPORT label |
| Spam | category = `spam` | Run Log row, JUNK label |
| Unknown | category is none of the four | Dead Letter row, stage `validate` |

- Reply drafts (Gmail, Create a draft) go to the sender with the subject `Re: <subject>`. They are never sent.
- The alert (Gmail, Send an email) is the only email the scenario sends, and it goes to the demo inbox.
- Each label module has the filter "Email only" (`source` = `email`): a web form message has no Gmail message, so it gets no label.
- The Leads row stores the draft id from the draft module.

### Retry handlers and Google Sheets settings

- Every Google Sheets, Gmail and Gemini module has a **Retry** error handler (`builtin:Break`): 3 attempts, 1 minute apart. The only exception is the Add a row inside the "bad AI output" error handler route, which has none.
- Every Add a row module has **Value input option** `RAW`, so text from a sender or from the AI is stored as text and never run as a formula. The module needs this value set.

### What happens to failures

| Failure | Where it ends up |
|---|---|
| Wrong or missing secret | `403` answer, nothing stored |
| No subject and no body | `400` answer and a Dead Letter row (stage `normalize`) |
| Invalid JSON in the request | `400` answer from Make |
| AI answer not valid JSON | Dead Letter row (stage `parse`) |
| AI answer with an unknown category | Dead Letter row (stage `validate`) |
| Gemini, Sheets or Gmail error (rate limit, outage, timeout) | Retried 3 times, 1 minute apart; if the last try also fails, the run stays in the scenario's **Incomplete executions** list |

## Part 5: Email intake, module by module

1. **Watch demo inbox** (Gmail, Watch emails): filter type Gmail search, format full, mark as read No, at most 5 emails per run. Search:

   ```text
   in:inbox -from:me -from:make.com -from:google.com -label:HOT -label:COLD -label:SUPPORT -label:JUNK
   ```

   It skips the alerts the demo inbox sends itself, Make's own notification emails, Google's welcome emails and mail that already has a label. The first test without the `make.com` and `google.com` exclusions classified those emails too.
2. **Send to Process lead webhook** (HTTP, Make a request): `POST` to the Process lead webhook URL with the `X-Webhook-Secret` header. Body from the data structure `Lead Inbox email to webhook body`: `source` `email`, the Gmail message id, sender name and address, subject, full text body and the received time in UTC. Retry handler: 3 attempts, 1 minute apart.

Process lead uses the Gmail message id to add the label, so labels work only for messages that came through Email intake.

## Part 6: Test results (2026-11-02)

Web form path, `scripts/send-test-leads.mjs` with `WEBHOOK_URL` pointing at the Process lead webhook:

- 16 of 16 HTTP results as expected. Make answers invalid JSON with `400` (n8n answers `422`); the script counts both as rejected.
- 12 of 12 demo messages classified as expected.
- `demo-001` sent twice gave one Leads row (the duplicate check works).
- The message without subject and body gave one Dead Letter row.
- The Gemini free tier answered `503` "high demand" or timed out after 40 seconds on some calls. The Retry handler recovered all of them.

Email path: four `[DEMO]` emails (hot, cold, support, spam) were all classified correctly, with the drafts, the labels and the hot lead alert.

To run the web form test yourself: fill your local `.env` (git-ignored) with `WEBHOOK_URL` and `WEBHOOK_SECRET`, turn Process lead on, run `node --env-file=.env scripts/send-test-leads.mjs`, then check the three tabs, Gmail Drafts and the alert, and turn the scenario off again.

## Part 7: Credits, keep the scenarios off

- Each processed lead used about 8 to 10 operations (Make execution logs).
- Email intake polls at the 15-minute minimum and uses a credit on every poll, even when there is no new mail: about 2,900 a month, which is more than the 1,000 free credits on its own.
- So both scenarios stay **off** and are switched on only for a test or a demo. For an email test, you can also send the email and click **Run once** in Email intake instead of switching it on.
- One full run of the test script (16 requests, 12 of them classified) uses roughly 100 to 120 operations for the 12 classified messages, plus the bad cases and the Retry attempts. This is an estimate from the per-lead number, NOT VERIFIED as a total.

## Part 8: Differences from the n8n version

| Topic | n8n | Make |
|---|---|---|
| AI output cleanup | `src/cleanup.js` strips code fences, fixes small mistakes (for example `Hot Lead` to `hot_lead`) and validates | None: the answer is parsed as is (JSON output mode makes fences rare) and the category must match exactly |
| Invalid AI output | One repair call to Gemini, then Dead Letter | No repair call: straight to Dead Letter (stage `parse` or `validate`) |
| Sheets writes | Append or update on a key column, so a retry never adds a second row | Add a row only. The duplicate check covers Leads only. Run Log and Dead Letter rows are add-only, so a retry after a write that already succeeded could add a duplicate row |
| Messages sent again | Leads, Run Log and Dead Letter are keyed, so a repeat changes nothing | A repeat of a message that has a Leads row stops at the duplicate check. A repeat of a spam message or a message that went to Dead Letter is processed again and adds another row |
| Call that still fails after retries | Dead Letter row | Stays in **Incomplete executions**, which acts as Make's dead-letter queue. After a test, open that list and retry or delete each item |
| Retry timing | 3 tries, 5 seconds apart | 3 attempts, 1 minute apart |
| Invalid JSON request | `422` | `400` |
| Webhook secret | Header Auth credential | Compared in scenario filters; the value is part of the scenario in the Make account |
| Email polling | Every minute | Every 15 minutes at most, off outside demos |

## Part 9: Export after a change

1. In the scenario, open the `...` menu and choose **Export Blueprint**.
2. Pretty-print the file with 2-space indentation and save it over the file in `make/`.
3. Follow "Before committing a new export" in `make/README.md` (put the placeholders back), then run `npm test` before committing.
