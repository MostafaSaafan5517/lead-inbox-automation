# Make.com build guide

A click-by-click guide to build the Make.com version of the lead inbox on the **Free plan**. It builds two scenarios:

- **Scenario B, "Process lead"** (`process-lead.blueprint.json`): receives one message on a webhook, checks it, asks Gemini, repairs once if needed, and routes it by category. Build this one first, because Scenario A needs its webhook URL.
- **Scenario A, "Email intake"** (`email-intake.blueprint.json`): watches the demo Gmail inbox and posts each new email to Scenario B. Keep it **off** outside tests and demos to save credits.

The behaviour is the same as the n8n version and the table in the main README. Where Make does something differently or weaker, this guide says so.

Status: written from Make's public help pages and a published example blueprint, **not yet clicked through in the Make editor**. Menu names and option labels may differ slightly. If something does not match, follow the closest option and note it, so this guide can be corrected after the first build.

## Free plan limits this design respects

| Limit | Value | Source |
|---|---|---|
| Credits | 1,000 per month | Make pricing page |
| Active scenarios | 2 | Third-party sources, NOT VERIFIED on make.com |
| Minimum schedule interval | 15 minutes | Third-party sources, NOT VERIFIED on make.com |

That is why there are exactly two scenarios, why Scenario B is triggered instantly by a webhook, and why Scenario A (the only polling scenario) stays off unless you are testing or recording a demo.

## How to read this guide

- Module numbers (for example **module 4**) are the ids Make shows in the small bubble on each module. Make numbers modules in the order you add them, so add them in the order below and the formulas will match. If your numbers differ, change the number in each formula (for example `4.subject` means "the `subject` output of module 4").
- Text in `code` is typed or pasted exactly. Formulas such as `{{trim(1.subject)}}` are written in Make's mapping syntax: in the editor, type the function name from the function panel and pick the item from the module's output.
- A **filter** sits on the link (the dotted line) in front of a module. Click the link, choose **Set up a filter**, give it the label below, then add the conditions. "AND" rows go in the same group; "OR" starts a new group with the **Add OR rule** button.
- An **error handler** is added by right-clicking a module and choosing **Add error handler**.

## Part 1: Before you start

You need (all from the build plan's manual steps):

1. The demo Gmail account, signed in in your browser.
2. A Make.com Free account. Sign in.
3. The Google Sheet with three tabs, `Leads`, `Dead Letter` and `Run Log`, with the header rows from `test-data/sheet-headers/`. The Leads tab must keep `message_id` in **column E**, because the duplicate check reads that column.
4. The Gmail labels `HOT`, `COLD`, `SUPPORT` and `SPAM` in the demo inbox.
5. A Gemini API key from Google AI Studio, signed in as the demo account, no billing. Keep it in your password manager. You paste it into Make once, in step 2.3.
6. A long random webhook secret (for example 40 random letters and digits). Keep it in your password manager and in your local `.env` as `WEBHOOK_SECRET`. Never commit it.

## Part 2: Connections and keychains

Create these once. Make stores them in your account; nothing secret goes into the repo.

1. **Gmail connection.** You create it the first time you add a Gmail module (step 3.13). Choose the new Gmail app (not "Gmail (legacy)"), click **Create a connection**, name it `Demo Gmail` and sign in with the demo account. The current Gmail app works with a personal Gmail account without your own Google Cloud project.
2. **Google Sheets connection.** You create it the first time you add a Google Sheets module (step 3.4). Name it `Demo Sheets` and sign in with the demo account. If Google blocks the sign-in, open **Show advanced settings** in the connection dialog and enter the OAuth client ID and secret from the Google Cloud project you made for n8n. Add Make's redirect URI (shown in the Make help for Google Sheets) to that OAuth client first. NOT VERIFIED whether the Free plan needs this.
3. **Gemini API key keychain.** You create it in the first HTTP module (step 3.8): authentication type **API key**, then **Add** a new keychain named `Gemini API key`, placement **In the header**, parameter name `x-goog-api-key`, value: paste your Gemini key.
4. **Webhook secret keychain.** You create it in Scenario A's HTTP module (step 5.3): authentication type **API key**, keychain name `Webhook secret`, placement **In the header**, parameter name `X-Webhook-Secret`, value: your webhook secret.

## Part 3: Build Scenario B, "Process lead"

Go to **Scenarios**, click **Create a new scenario**, and rename it `Lead Inbox: Process lead (demo)`.

Optional shortcut: instead of building by hand, open the `...` menu at the bottom of the editor, choose **Import Blueprint** and pick `make/process-lead.blueprint.json`. The draft is NOT VERIFIED (see `make/README.md`), so walk through every step below afterwards and fix what did not import.

### Data structures (create first)

Open **Data structures** in the left menu and create three. For each, click **Add**, give the name, click **Generator**, choose content type **JSON**, paste the sample and click **Save**.

1. `Lead input`:

   ```json
   {"source": "form", "message_id": "demo-001", "from_name": "Ada Example", "from_email": "ada@example.com", "subject": "[DEMO] Example", "body": "Text", "received_at": "2026-11-01T10:00:00.000Z"}
   ```

2. `Gemini request`:

   ```json
   {"systemInstruction": {"parts": [{"text": "x"}]}, "contents": [{"role": "user", "parts": [{"text": "x"}]}], "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 512, "temperature": 0.2}}
   ```

3. `AI lead`:

   ```json
   {"category": "hot_lead", "confidence": 0.9, "name": "x", "company": "x", "budget": "x", "need": "x", "urgency": "high", "reply_draft": "x", "reason": "x"}
   ```

### 3.1 Module 1: Webhooks, Custom webhook ("Lead webhook")

1. Click the big plus, search **Webhooks**, choose **Custom webhook**.
2. Click **Create a webhook**. Name: `lead-inbox`.
3. Open **Show advanced settings**: **Data structure** `Lead input`, **Get request headers** Yes, **JSON pass-through** No.
4. Save. Copy the webhook URL. It goes into your local `.env` as `WEBHOOK_URL` and into Scenario A (step 5.3). It is not secret, but keep it out of the repo.
5. Click **Run once** in the editor, then send one demo request so Make learns the payload: `node --env-file=.env scripts/send-test-leads.mjs` and stop it with Ctrl+C after the first line, or post one message with any HTTP tool.
6. Open the output bubble of module 1 and check the header list. Find the secret header and note how its **name** is written (for example `x-webhook-secret`). The filters below assume lower case. If Make shows another case, use that exact text in steps 3.2 and 3.3.

### 3.2 Router ("Check secret") and module 3: Webhook response 403

1. Add **Flow control**, **Router** after module 1. It gets number 2.
2. First route: add **Webhooks**, **Webhook response**. Status `403`. Body:

   ```text
   {"error": "Forbidden"}
   ```

   Advanced settings, **Custom headers**: `Content-Type` = `application/json`.
3. Filter on the link from the router to module 3, label `Wrong secret`:
   - Condition: `{{get(map(1.__IMTHEADERS__; value; name; x-webhook-secret); 1)}}`
   - Operator: **Text operators: Not equal to**
   - Value: your webhook secret (typed here in the editor only).

   A missing header gives an empty value, which is also "not equal", so it is rejected.

### 3.3 Module 4: Tools, Set multiple variables ("Config and normalize")

1. Add a second route from the router: **Tools**, **Set multiple variables**.
2. Filter on that link, label `Secret OK`: same condition as above, operator **Text operators: Equal to**, value: your webhook secret.
3. Variable lifetime: **One cycle**. Add these variables (name, then value):

   | Name | Value |
   |---|---|
   | `gemini_model` | `gemini-3.1-flash-lite` |
   | `max_output_tokens` | `512` |
   | `alert_to` | `demo-inbox@example.com` (change to the demo inbox's own address) |
   | `spreadsheet_id` | the id from your Sheet's URL (the part between `/d/` and `/edit`) |
   | `source` | `{{if(1.source = "email"; "email"; "form")}}` |
   | `message_id` | `{{ifempty(trim(1.message_id); if(1.source = "email"; emptystring; "form-" + timestamp + "-" + substring(uuid; 0; 6)))}}` |
   | `from_name` | `{{trim(1.from_name)}}` |
   | `from_email` | `{{lower(trim(1.from_email))}}` |
   | `subject` | `{{trim(1.subject)}}` |
   | `body` | `{{substring(trim(1.body); 0; 4000)}}` |
   | `received_at` | `{{ifempty(trim(1.received_at); formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSSZ"))}}` |

   `gemini_model` is the only place the model id is set. Check it against the current Flash-Lite id in Google AI Studio (the n8n setup notes that `gemini-3.1-flash-lite` is listed with a free tier on the Gemini API pricing page as of 2026-11-01).

### 3.4 Router ("Check input"), module 6 (Webhook response 400) and module 7 (Dead Letter row)

1. Add a **Router** after module 4 (number 5).
2. First route, module 6: **Webhook response**, status `400`, header `Content-Type` = `application/json`, body:

   ```text
   {"error": "{{if(length(4.message_id) = 0; "Email message has no message_id"; "Message has no subject and no body")}}"}
   ```

3. Filter on the link to module 6, label `Invalid input`:
   - Group 1: `{{4.subject}}` **Basic operators: Does not exist**, AND `{{4.body}}` **Does not exist**
   - OR group 2: `{{4.message_id}}` **Does not exist**
4. After module 6, module 7: **Google Sheets**, **Add a row**. Create the `Demo Sheets` connection here. Search method: select from the list, pick your spreadsheet, sheet `Dead Letter`, **Table contains headers** Yes. Map the columns:

   | Column | Value |
   |---|---|
   | time | `{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSSZ")}}` |
   | tool | `make` |
   | source | `{{4.source}}` |
   | message_id | `{{1.message_id}}` |
   | stage | `normalize` |
   | error | same `if(...)` formula as the 400 body |
   | raw_payload | `from={{1.from_email}} subject={{substring(1.subject; 0; 400)}}` |

5. Add the **Retry** error handler to module 7 (see "Retry handler settings" below).

### 3.5 Module 8: Webhook response 202

1. Second route from router 5: **Webhook response**, status `202`, header `Content-Type` = `application/json`, body:

   ```text
   {"message_id": "{{4.message_id}}"}
   ```

2. Filter on the link, label `Valid input`:
   - Group 1: `{{4.subject}}` **Exists** AND `{{4.message_id}}` **Exists**
   - OR group 2: `{{4.body}}` **Exists** AND `{{4.message_id}}` **Exists**

   The caller gets `202` now. Everything after this runs in the background, like the n8n version.

### 3.6 Module 9: Google Sheets, Make an API call ("Read Leads message ids")

Make's **Search rows** module returns nothing at all when no row matches, which would stop the scenario for every new lead. One API call that reads the whole `message_id` column always returns one bundle, so it works as a duplicate check.

1. Add **Google Sheets**, **Make an API call**. Connection `Demo Sheets`.
2. URL: `/v4/spreadsheets/{{4.spreadsheet_id}}/values/Leads!E:E`
3. Method: `GET`. No headers, no query string, no body.
4. Add the **Retry** error handler.

### 3.7 Module 10: JSON, Create JSON ("Build classify request")

1. Add **JSON**, **Create JSON**. Data structure `Gemini request`.
2. Filter on the link from module 9, label `Not a duplicate`:
   - `{{contains(flatten(9.body.values); 4.message_id)}}` **Text operators: Not equal to** `true`

   A duplicate stops here, like "Drop duplicates" in n8n.
3. Map:
   - `systemInstruction.parts[1].text`: paste the whole system prompt from `prompts/classify.md` (the text block under "System prompt").
   - `contents[1].role`: `user`
   - `contents[1].parts[1].text`: paste the user template from `prompts/classify.md` and replace each placeholder with the module 4 item: `{{source}}` becomes `{{4.source}}`, and the same for `from_name`, `from_email`, `received_at`, `subject` and `body`.
   - `generationConfig.responseMimeType`: `application/json`
   - `generationConfig.maxOutputTokens`: `{{4.max_output_tokens}}`
   - `generationConfig.temperature`: `0.2`

   Create JSON escapes quotes and line breaks in the message for you, which is why it is used instead of typing JSON into the HTTP module.

### 3.8 Module 11: HTTP, Make a request ("Gemini classify")

1. Add **HTTP**, **Make a request**.
2. Authentication type: **API key**. Keychain: create `Gemini API key` (Part 2, step 3).
3. URL: `https://generativelanguage.googleapis.com/v1beta/models/{{4.gemini_model}}:generateContent`
4. Method: `POST`. Body content type: `application/json`. Body: map `{{10.json}}` (the JSON string from module 10; pick the "JSON string" input option if Make offers a choice).
5. **Parse response**: Yes. Timeout: `30` seconds.
6. Turn on the option that treats non-2xx answers as errors (in older HTTP modules it is called **Evaluate all states as errors**). This makes a `429` rate limit or a `503` go to the Retry handler.
7. Add the **Retry** error handler.

### 3.9 Module 12: JSON, Parse JSON ("Parse first answer")

1. Add **JSON**, **Parse JSON**. Data structure `AI lead`.
2. JSON string:

   ```text
   {{trim(replace(11.data.candidates[1].content.parts[1].text; /```(?:json)?/gi; emptystring))}}
   ```

   This removes code fences, like the n8n cleanup. If module 11's output puts the body under another name than `data`, pick the same path from the output panel.
3. Right-click, **Add error handler**, choose **Resume**. Set the substitute output: `category` empty, `reply_draft` empty. A broken answer then continues as "invalid" and gets its one repair, instead of stopping the scenario.

### 3.10 Router ("Repair if needed"): modules 14, 15, 16 on route 1

The two routes of a router run one after the other, in order. Route 1 runs the repair only when it is needed and stores the result; route 2 always runs and picks the repaired answer if there is one. This is how Make rejoins two paths without duplicating the rest of the scenario.

1. Add a **Router** after module 12 (number 13).
2. Route 1, module 14: **JSON**, **Create JSON**, data structure `Gemini request`. Filter on the link, label `First answer invalid`:
   - Group 1: `{{replace(trim(replace(lower(12.category); /[^a-z]+/g; space)); space; "_")}}` **Text operators: Does not match pattern** `^(hot_lead|cold_lead|support|spam)$`
   - OR group 2: the same category formula **Text operators: Not equal to** `spam`, AND `{{12.reply_draft}}` **Does not exist**

   Map module 14:
   - `systemInstruction.parts[1].text`: the system prompt from `prompts/repair.md`.
   - `contents[1].role`: `user`
   - `contents[1].parts[1].text`: the user template from `prompts/repair.md`, with `{{error}}` replaced by this fixed text:

     ```text
     The answer must be one valid JSON object. category must be one of hot_lead, cold_lead, support, spam. reply_draft must be a non-empty string unless category is spam.
     ```

     and `{{raw_output}}` replaced by `{{substring(11.data.candidates[1].content.parts[1].text; 0; 4000)}}`.
   - `generationConfig`: same three values as module 10.
3. Module 15: **HTTP**, **Make a request**, exactly like module 11 but body `{{14.json}}`. Same keychain, same Retry error handler.
4. Module 16: **Tools**, **Set variable**. Name `repaired_text`, lifetime **One cycle**, value:

   ```text
   {{trim(replace(15.data.candidates[1].content.parts[1].text; /```(?:json)?/gi; emptystring))}}
   ```

### 3.11 Route 2: modules 17 and 18, and the repair Dead Letter

1. Route 2 of router 13 (no filter), module 17: **Tools**, **Get variable**, name `repaired_text`.
2. Module 18: **JSON**, **Parse JSON**, data structure `AI lead`. JSON string:

   ```text
   {{ifempty(17.value; trim(replace(11.data.candidates[1].content.parts[1].text; /```(?:json)?/gi; emptystring)))}}
   ```

   If there was a repair, this parses the repaired answer; otherwise the first answer again.
3. Error handler on module 18 (repaired answer is not JSON): right-click, **Add error handler**, first add **Google Sheets**, **Add a row** to `Dead Letter` (module 19 or the next free number) with: time (the `formatDate(now; ...)` formula), tool `make`, source `{{4.source}}`, message_id `{{4.message_id}}`, stage `repair parse`, error `Repaired answer is not valid JSON`, raw_payload `{{substring(17.value; 0; 500)}}`. Then end the handler route with **Ignore**.

### 3.12 Router ("Final answer valid?"): module 22 (Dead Letter) and module 23 ("Clean lead")

1. Add a **Router** after module 18 (number 21 in the draft; the number does not matter for routers).
2. Route 1, module 22: **Google Sheets**, **Add a row** to `Dead Letter`: time, tool `make`, source `{{4.source}}`, message_id `{{4.message_id}}`, stage `repair validate`, error `Invalid category or missing reply_draft after one repair`, raw_payload `{{substring(ifempty(17.value; 11.data.candidates[1].content.parts[1].text); 0; 500)}}`. Retry error handler.

   Filter label `Final answer invalid`: the same two groups as `First answer invalid`, with `18.` instead of `12.`.
3. Route 2, module 23: **Tools**, **Set multiple variables**, lifetime **One cycle**. Filter label `Final answer valid`:
   - Group 1: category formula (with `18.`) **Matches pattern** `^(hot_lead|cold_lead|support|spam)$` AND category formula **Equal to** `spam`
   - OR group 2: category formula **Matches pattern** `^(hot_lead|cold_lead|support|spam)$` AND `{{18.reply_draft}}` **Exists**

   Variables:

   | Name | Value |
   |---|---|
   | `category` | `{{replace(trim(replace(lower(18.category); /[^a-z]+/g; space)); space; "_")}}` |
   | `confidence` | `{{min(1; max(0; ifempty(18.confidence; 0)))}}` |
   | `name` | `{{trim(18.name)}}` |
   | `company` | `{{trim(18.company)}}` |
   | `budget` | `{{trim(18.budget)}}` |
   | `need` | `{{trim(18.need)}}` |
   | `urgency` | `{{if(contains(split("high,normal,low"; ","); lower(trim(18.urgency))); lower(trim(18.urgency)); "normal")}}` |
   | `reply_draft` | `{{if(replace(trim(replace(lower(18.category); /[^a-z]+/g; space)); space; "_") = "spam"; emptystring; trim(18.reply_draft))}}` |
   | `reason` | `{{ifempty(trim(18.reason); "No reason given")}}` |

### 3.13 Router ("Route by category"): modules 25 to 32

Add a **Router** after module 23 (number 24) with **seven routes**, in this order (routes run top to bottom):

1. **Not spam: draft and Leads row.** Filter `Not spam`: `{{23.category}}` **Not equal to** `spam`.
   - Module 25: **Gmail**, **Create a draft email**. Create the `Demo Gmail` connection here. To: `{{4.from_email}}`. Subject: `Re: {{4.subject}}`. Content type: plain text. Content: `{{23.reply_draft}}`. Retry error handler. The draft is never sent.
   - Module 26: **Google Sheets**, **Add a row** to `Leads` (Retry error handler):

     | Column | Value |
     |---|---|
     | received_at | `{{4.received_at}}` |
     | processed_at | `{{formatDate(now; "YYYY-MM-DDTHH:mm:ss.SSSZ")}}` |
     | tool | `make` |
     | source | `{{4.source}}` |
     | message_id | `{{4.message_id}}` |
     | from_name | `{{4.from_name}}` |
     | from_email | `{{4.from_email}}` |
     | subject | `{{4.subject}}` |
     | category | `{{23.category}}` |
     | confidence | `{{23.confidence}}` |
     | name | `{{23.name}}` |
     | company | `{{23.company}}` |
     | budget | `{{23.budget}}` |
     | need | `{{23.need}}` |
     | urgency | `{{23.urgency}}` |
     | reason | `{{23.reason}}` |
     | draft_id | `{{25.id}}` (the draft id from module 25's output) |

2. **Hot lead alert.** Filter `Hot lead`: `{{23.category}}` **Equal to** `hot_lead`.
   - Module 27: **Gmail**, **Send an email**. To: `{{4.alert_to}}` only. Subject: `[DEMO ALERT] Hot lead: {{4.subject}}`. Plain text content:

     ```text
     Hot lead from {{ifempty(4.from_name; "unknown")}} <{{ifempty(4.from_email; "no address")}}>
     Company: {{ifempty(23.company; "-")}}
     Budget: {{ifempty(23.budget; "-")}}
     Need: {{ifempty(23.need; "-")}}
     Urgency: {{23.urgency}}
     Reason: {{23.reason}}

     A reply draft is waiting in Gmail Drafts. Nothing was sent to the sender.
     ```

     Retry error handler. This is the only email the scenario sends, and it goes to the demo inbox.
3. to 6. **Labels, one route per label.** Each route has one **Gmail**, **Update email labels** module (modules 28 to 31): message id `{{4.message_id}}`, labels to add: pick the label from the list. Retry error handler. Filters (both conditions with AND):

   | Route | Filter label | Conditions | Label |
   |---|---|---|---|
   | 3 | `Email and hot_lead` | `{{4.source}}` Equal to `email`, `{{23.category}}` Equal to `hot_lead` | HOT |
   | 4 | `Email and cold_lead` | ... `cold_lead` | COLD |
   | 5 | `Email and support` | ... `support` | SUPPORT |
   | 6 | `Email and spam` | ... `spam` | SPAM |

   Web form messages have no Gmail message, so they skip all four.
7. **Run Log.** No filter. Module 32: **Google Sheets**, **Add a row** to `Run Log` (Retry error handler): time (the `formatDate(now; ...)` formula), tool `make`, source `{{4.source}}`, message_id `{{4.message_id}}`, category `{{23.category}}`, note `{{23.reason}}`, outcome:

   ```text
   {{switch(23.category; "hot_lead"; "Leads row, draft, HOT label, alert"; "cold_lead"; "Leads row, draft, COLD label"; "support"; "Leads row, draft, SUPPORT label"; "SPAM label only")}}
   ```

Spam therefore gets only the SPAM label (email only) and a Run Log row, with no draft and no Leads row, like the n8n version.

### Retry handler settings

Use these on every Gemini, Google Sheets and Gmail module listed above (modules 7, 9, 11, 15, 22, 25 to 32):

1. Right-click the module, **Add error handler**, **Retry**.
2. **Automatically complete execution**: Yes. Number of attempts: `3`. Interval: `5` minutes. (A Make community thread reports that very short intervals are scheduled later than set; NOT VERIFIED.)
3. Retry needs **Allow storing of incomplete executions** in the scenario settings (next section). Without it, Make will not let you save the handler.

### Scenario settings

Click the gear icon (**Scenario settings**) at the bottom of the editor:

1. **Allow storing of incomplete executions**: Yes (needed by Retry).
2. **Sequential processing**: Yes. Webhook requests are then processed one at a time, which keeps Gemini calls spaced out for the free tier rate limit.
3. Save the scenario. Set scheduling to **Immediately** (the default for webhook scenarios) and turn the scenario **on**.

### What happens to failures

| Failure | Where it ends up |
|---|---|
| Wrong or missing secret | `403` response, nothing stored |
| No subject and no body | `400` response and a Dead Letter row (stage `normalize`) |
| First AI answer not JSON or invalid | One repair call |
| Repaired answer not JSON | Dead Letter row (stage `repair parse`) |
| Repaired answer still invalid | Dead Letter row (stage `repair validate`) |
| Gemini, Sheets or Gmail error (rate limit, outage) | Retried 3 times; if the last try also fails, the run stays in **Incomplete executions** |

Difference from n8n: n8n writes a Dead Letter row when a Gemini call still fails after its retries. Make's Retry handler has no step that runs after the last failed attempt (not found in Make's Retry help page; NOT VERIFIED that none exists), so those runs stay in the scenario's **Incomplete executions** tab instead. After a test or a demo, open that tab: retry each item there, or copy it into the Dead Letter tab by hand.

## Part 4: Test Scenario B

1. Fill your local `.env` (git-ignored): `WEBHOOK_URL` = the module 1 webhook URL, `WEBHOOK_SECRET` = your secret.
2. Run `node --env-file=.env scripts/send-test-leads.mjs`. It sends the 12 demo messages and four bad cases, five seconds apart.
3. Expected: valid messages get `202`, the message without subject and body gets `400`, a wrong secret gets `403`. The invalid JSON case should be rejected by Make before the scenario runs; the exact status code Make returns is NOT VERIFIED (n8n returns `422`). The script only checks accepted versus rejected.
4. Check the Leads, Dead Letter and Run Log tabs, Gmail Drafts and the alert emails.

## Part 5: Build Scenario A, "Email intake"

Create a new scenario, rename it `Lead Inbox: Email intake (demo)`. Optional: **Import Blueprint** with `make/email-intake.blueprint.json` (NOT VERIFIED draft), then check each step.

### 5.1 Module 1: Gmail, Watch emails

1. Add **Gmail**, **Watch emails**, connection `Demo Gmail`.
2. Folder: `INBOX`. Filter type: Gmail search query, if offered, with:

   ```text
   -from:me -label:HOT -label:COLD -label:SUPPORT -label:SPAM
   ```

   This is the same search as the n8n Gmail Trigger: it skips the alerts the demo inbox sends itself and mail that already has a label. If the module has no search query field (NOT VERIFIED for the current Gmail app), leave the criteria at "all emails" and add a filter on the link to module 2: sender email address **Not equal to** the demo inbox address.
3. Mark as read: No. Maximum number of results: `5`.
4. When Make asks where to start, choose **From now on**.

### 5.2 Module 2: JSON, Create JSON ("Build lead payload")

Data structure `Lead input`. Map (pick each item from module 1's output panel; the item names below are NOT VERIFIED for the current Gmail app):

| Field | Value |
|---|---|
| source | `email` |
| message_id | the Gmail **message id** (the API id, not the `Message-ID` header), for example `{{1.id}}` |
| from_name | the sender's name, for example `{{1.from.name}}` |
| from_email | the sender's address, for example `{{1.from.address}}` |
| subject | `{{1.subject}}` |
| body | `{{substring(1.text; 0; 4000)}}` (the plain text body) |
| received_at | `{{formatDate(1.date; "YYYY-MM-DDTHH:mm:ss.SSSZ")}}` |

### 5.3 Module 3: HTTP, Make a request ("Send to Process lead")

1. URL: Scenario B's webhook URL (from step 3.1).
2. Method `POST`, body content type `application/json`, body `{{2.json}}`.
3. Authentication type **API key**, keychain `Webhook secret` (Part 2, step 4), so the `X-Webhook-Secret` header is added from the keychain and never typed into the scenario.
4. Parse response: Yes. Treat non-2xx answers as errors: Yes. Retry error handler (same settings as above).

### 5.4 Settings and schedule

1. Scenario settings: **Allow storing of incomplete executions** Yes, **Sequential processing** Yes.
2. Schedule: every 15 minutes at most (the Free minimum, NOT VERIFIED).
3. Keep the scenario **off**. For a test or a demo, either click **Run once** right after sending a test email, or turn it on for the length of the demo and off again afterwards.

## Part 6: Credit estimate

All numbers below are an **estimate, NOT VERIFIED**. They assume Make charges 1 credit per module run (including the webhook trigger and each Webhook response), 0 credits for routers, filters and error handler directives, and 1 credit for each Scenario A check even when no email is found. Check the real numbers in the scenario's run history after the first test.

| Case | Scenario B | Scenario A | Total |
|---|---|---|---|
| Web form, hot lead, first answer valid | 14 | 0 | 14 |
| Web form, cold lead or support | 13 | 0 | 13 |
| Web form, spam | 11 | 0 | 11 |
| Email, hot lead | 15 | 3 | 18 |
| Email, spam | 12 | 3 | 15 |
| Extra when a repair is needed | +3 | 0 | +3 |
| Wrong secret | 2 | 0 | 2 |
| No subject and no body | 4 | 0 | 4 |
| Duplicate message | 4 | 0 | 4 |

How Scenario B's 14 for a web form hot lead adds up: webhook 1, set variables 1, response 202 1, read message ids 1, create JSON 1, Gemini 1, parse 1, get variable 1, parse final 1, clean lead 1, draft 1, Leads row 1, alert 1, Run Log row 1.

What that means on 1,000 credits a month:

- One full run of `scripts/send-test-leads.mjs` (16 requests): about 160 to 200 credits.
- Scenario A left on at a 15-minute interval: 4 checks an hour, about 2,900 checks a month, which alone is more than the 1,000 credits. That is why it stays off outside tests and demos.

## Part 7: Where Make's cleanup is weaker than the n8n Code node

The n8n version runs `cleanAiOutput` from `src/cleanup.js`, with unit tests. Make's Free plan has no shared JavaScript, so Scenario B rebuilds the same rules with built-in functions and filters. Same rules, but weaker in these places:

| Rule | n8n (`src/cleanup.js`) | Make (Scenario B) |
|---|---|---|
| Code fences | Removed | Removed (`replace` with a regex) |
| Text before or after the JSON | Cut away (first `{` to last `}`) | Not cut away: the answer fails to parse and goes to the repair call. JSON output mode makes this rare. |
| Category spelling | `Hot Lead`, `hot-lead`, `HOT`, `lead (hot)` all become `hot_lead` | `Hot Lead` and `hot-lead` become `hot_lead`; `HOT` or `lead (hot)` do not and go to the repair call |
| Confidence | Any number-like value, clamped to 0..1, else 0 | Clamped to 0..1, empty becomes 0; a non-numeric string is not handled (NOT VERIFIED what `min`/`max` do with text) |
| Empty or whitespace-only reply draft | Rejected | Empty rejected; whitespace only passes the filter (then trimmed to empty) |
| Error sent to the repair call | The exact validation error | One fixed text listing all the rules |
| Tests | `node:test` unit tests run on every commit | None inside Make; checked by running the demo set |
| Input normalizing | `normalizeInput`, unit tested | Formulas in module 4, same rules, not unit tested |

## Part 8: Export the working blueprints

When both scenarios work:

1. In each scenario, open the `...` menu, **Export Blueprint**.
2. Save the files over `make/process-lead.blueprint.json` and `make/email-intake.blueprint.json`.
3. Follow "Before committing an exported blueprint" in `make/README.md` (remove the secret, ids and URL), then run `npm test` before committing.
