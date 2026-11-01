// Posts the demo messages to the web form webhook, then a set of bad requests.
// Usage:
//   node scripts/send-test-leads.mjs --dry-run   (prints what would be sent, no network)
//   node --env-file=.env scripts/send-test-leads.mjs   (WEBHOOK_URL and WEBHOOK_SECRET in .env)
// The URL and secret are read from the environment only and are never printed.
import { readFileSync } from "node:fs";

const DELAY_MS = 5000; // spacing between requests so the Gemini free tier rate limit is not hit
const TIMEOUT_MS = 30000;
const OVERSIZE_LENGTH = 20000;

const dryRun = process.argv.includes("--dry-run");
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.WEBHOOK_SECRET;

const messages = JSON.parse(readFileSync(new URL("../test-data/messages.json", import.meta.url), "utf8"));

function formPayload({ message_id, from_name, from_email, subject, body }) {
  return JSON.stringify({ message_id, from_name, from_email, subject, body });
}

const cases = [
  ...messages.map((demo) => ({
    name: `${demo.message_id} ${demo.expected_category}`,
    expect: "accepted",
    secret: "valid",
    body: formPayload(demo),
  })),
  {
    name: "wrong secret",
    expect: "rejected",
    secret: "wrong",
    body: formPayload({ ...messages[0], message_id: "demo-bad-secret" }),
  },
  {
    name: "missing body and subject",
    expect: "rejected",
    secret: "valid",
    body: JSON.stringify({
      message_id: "demo-bad-empty",
      from_name: "Empty Formsworth",
      from_email: "empty.formsworth@example.com",
    }),
  },
  {
    name: "oversize body (cut to 4000)",
    expect: "accepted",
    secret: "valid",
    body: formPayload({
      ...messages[3],
      message_id: "demo-bad-oversize",
      subject: "[DEMO] Oversize body test",
      body: `${messages[3].body} ${"padding ".repeat(OVERSIZE_LENGTH / 8)}`,
    }),
  },
  {
    name: "invalid JSON",
    expect: "rejected",
    secret: "valid",
    body: '{"message_id": "demo-bad-json", "subject": "[DEMO] Broken", ',
  },
];

function headersFor(testCase) {
  const secret = testCase.secret === "valid" ? webhookSecret : "demo-wrong-secret";
  return { "Content-Type": "application/json", "X-Webhook-Secret": secret };
}

function printTable(rows) {
  const columns = Object.keys(rows[0]);
  const widths = columns.map((column) => Math.max(column.length, ...rows.map((row) => String(row[column]).length)));
  const line = (values) => values.map((value, index) => String(value).padEnd(widths[index])).join("  ");
  process.stdout.write(`${line(columns)}\n${line(widths.map((width) => "-".repeat(width)))}\n`);
  for (const row of rows) process.stdout.write(`${line(columns.map((column) => row[column]))}\n`);
}

function preview(text) {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

async function send(testCase) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: headersFor(testCase),
      body: testCase.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status, got: response.ok ? "accepted" : "rejected" };
  } catch (requestError) {
    return { status: "-", got: `network error: ${requestError.name}` };
  }
}

if (dryRun) {
  process.stdout.write(
    `Dry run: ${cases.length} requests, POST to WEBHOOK_URL (${webhookUrl ? "set" : "not set"}), ` +
      `X-Webhook-Secret from WEBHOOK_SECRET (${webhookSecret ? "set" : "not set"}). No network calls.\n\n`,
  );
  printTable(
    cases.map((testCase) => ({
      case: testCase.name,
      expect: testCase.expect,
      secret: testCase.secret === "valid" ? "<WEBHOOK_SECRET>" : "<wrong secret>",
      bytes: Buffer.byteLength(testCase.body),
      payload: preview(testCase.body),
    })),
  );
} else {
  if (!webhookUrl || !webhookSecret) {
    process.stderr.write("Set WEBHOOK_URL and WEBHOOK_SECRET in the environment, or use --dry-run.\n");
    process.exit(1);
  }

  const rows = [];
  for (const [index, testCase] of cases.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    const { status, got } = await send(testCase);
    rows.push({ case: testCase.name, expect: testCase.expect, status, got, match: got === testCase.expect ? "yes" : "NO" });
  }
  printTable(rows);
  if (rows.some((row) => row.match !== "yes")) process.exitCode = 1;
}
