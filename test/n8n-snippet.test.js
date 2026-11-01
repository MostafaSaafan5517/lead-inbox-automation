import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const buildScript = fileURLToPath(new URL("../scripts/build-n8n-code.mjs", import.meta.url));
execFileSync(process.execPath, [buildScript]);
const snippet = readFileSync(new URL("../dist/n8n-cleanup-snippet.js", import.meta.url), "utf8");

// n8n runs the Code node body as a function with $input in scope.
function runInCodeNode(json) {
  return new Function("$input", snippet)({ item: { json } });
}

test("n8n snippet normalizes an input item", () => {
  const { json } = runInCodeNode({ subject: " [DEMO] Hi ", body: "Need a quote." });
  assert.equal(json.ok, true);
  assert.equal(json.message.subject, "[DEMO] Hi");
});

test("n8n snippet cleans AI output and keeps the other fields", () => {
  const ai_text = '```json\n{"category":"Spam","confidence":0.9,"urgency":"low","reason":"Pitch"}\n```';
  const { json } = runInCodeNode({ message_id: "demo-011", ai_text });
  assert.equal(json.ok, true);
  assert.equal(json.message_id, "demo-011");
  assert.equal(json.lead.category, "spam");
});

test("n8n snippet has no import or export statements", () => {
  assert.doesNotMatch(snippet, /^\s*(import|export)\s/m);
});
