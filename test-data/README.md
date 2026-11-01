# Test data

Everything in this folder is invented demo data.

- `messages.json`: 12 demo messages in the normalized input shape (`schema/input.schema.json`), plus an `expected_category` field used only for checking results. 3 hot leads, 3 cold leads, 3 support, 2 spam and 1 tricky message (prompt injection, extra spaces, empty `received_at`) that should end up as spam.
- `sheet-headers/`: the header row for each Google Sheet tab (`leads.csv`, `dead-letter.csv`, `run-log.csv`). Import each file into its tab, or paste the row.

Rules for this data:

- All names and companies are fictional. Any resemblance to real people or businesses is accidental.
- Every sender uses an `@example.com` address (a domain reserved for documentation).
- Every subject starts with `[DEMO]`.
- Only demo data goes through the Gemini free tier, because Google may use free tier content to improve its products.
