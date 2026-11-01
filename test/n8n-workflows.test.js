import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnippet } from "../scripts/build-n8n-code.mjs";
import { SNIPPET_HEADER, expectedPrompts } from "../scripts/sync-n8n-workflows.mjs";

const FILES = ["lead-inbox.workflow.json", "error-handler.workflow.json"];
const CREDENTIAL_NAMES = {
  gmailOAuth2: "Demo Gmail",
  googleSheetsOAuth2Api: "Demo Sheets",
  httpHeaderAuth: ["Gemini API key", "Webhook secret"],
};
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{30,}/, // Google API key
  /ya29\.[0-9A-Za-z_-]+/, // Google OAuth access token
  /1\/\/0[0-9A-Za-z_-]{20,}/, // Google OAuth refresh token
  /GOCSPX-[0-9A-Za-z_-]+/, // Google OAuth client secret
  /\bsk-[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const raw = Object.fromEntries(FILES.map((file) => [file, readFileSync(new URL(`../n8n/${file}`, import.meta.url), "utf8")]));
const workflows = Object.fromEntries(FILES.map((file) => [file, JSON.parse(raw[file])]));

function allStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}

for (const file of FILES) {
  const workflow = workflows[file];

  test(`${file}: has nodes and is inactive`, () => {
    assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);
    assert.equal(workflow.active, false);
  });

  test(`${file}: node names are unique`, () => {
    const names = workflow.nodes.map((node) => node.name);
    assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), []);
  });

  test(`${file}: every connection points to an existing node`, () => {
    const names = new Set(workflow.nodes.map((node) => node.name));
    for (const [from, outputs] of Object.entries(workflow.connections)) {
      assert.ok(names.has(from), `unknown source node ${from}`);
      for (const target of Object.values(outputs).flat(2)) {
        assert.ok(names.has(target.node), `${from} connects to unknown node ${target.node}`);
      }
    }
  });

  test(`${file}: credentials are referenced by name only`, () => {
    for (const node of workflow.nodes) {
      for (const [type, reference] of Object.entries(node.credentials ?? {})) {
        assert.deepEqual(Object.keys(reference), ["name"], `${node.name} credential has more than a name`);
        assert.ok([CREDENTIAL_NAMES[type]].flat().includes(reference.name), `${node.name} uses ${type} "${reference.name}"`);
      }
    }
  });

  test(`${file}: no string looks like a secret`, () => {
    for (const text of allStrings(workflow)) {
      for (const pattern of SECRET_PATTERNS) assert.doesNotMatch(text, pattern);
      for (const token of text.match(/[A-Za-z0-9+/_=-]{40,}/g) ?? []) {
        assert.ok(UUID.test(token), `long token-like string: ${token.slice(0, 12)}...`);
      }
    }
  });

  test(`${file}: no em dash`, () => {
    assert.equal(raw[file].includes(String.fromCharCode(0x2014)), false);
  });

  test(`${file}: spreadsheet is a placeholder picked in the editor`, () => {
    for (const node of workflow.nodes.filter((item) => item.type === "n8n-nodes-base.googleSheets")) {
      assert.equal(node.parameters.documentId.value, "", `${node.name} has a spreadsheet id`);
    }
  });
}

test("lead-inbox: Code nodes match the current cleanup snippet", () => {
  const snippetNodes = workflows["lead-inbox.workflow.json"].nodes.filter((node) =>
    node.parameters.jsCode?.startsWith(SNIPPET_HEADER),
  );
  assert.deepEqual(
    snippetNodes.map((node) => node.name),
    ["Normalize input", "Clean AI output", "Clean repaired output"],
  );
  const snippet = buildSnippet();
  for (const node of snippetNodes) {
    assert.equal(node.parameters.jsCode, snippet, `${node.name} drifted, run node scripts/sync-n8n-workflows.mjs`);
  }
});

test("lead-inbox: Config prompts match prompts/", () => {
  const config = workflows["lead-inbox.workflow.json"].nodes.find((node) => node.name === "Config");
  const values = Object.fromEntries(config.parameters.assignments.assignments.map((item) => [item.name, item.value]));
  for (const [name, text] of Object.entries(expectedPrompts())) {
    assert.equal(values[name], text, `${name} drifted, run node scripts/sync-n8n-workflows.mjs`);
  }
  assert.equal(values.alert_to, "demo-inbox@example.com");
});

test("lead-inbox: Gemini calls use JSON output, retries and the Header Auth credential", () => {
  const nodes = workflows["lead-inbox.workflow.json"].nodes;
  for (const name of ["Gemini classify", "Gemini repair"]) {
    const node = nodes.find((item) => item.name === name);
    assert.match(node.parameters.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent$/);
    assert.equal(node.credentials.httpHeaderAuth.name, "Gemini API key");
    assert.deepEqual([node.retryOnFail, node.maxTries, node.waitBetweenTries], [true, 3, 5000]);
  }
  for (const name of ["Build classify request", "Build repair request"]) {
    const code = nodes.find((item) => item.name === name).parameters.jsCode;
    assert.match(code, /responseMimeType: "application\/json"/);
  }
});

test("lead-inbox: every Sheets and Gmail node retries on fail", () => {
  for (const workflow of Object.values(workflows)) {
    for (const node of workflow.nodes.filter((item) => /\.(googleSheets|gmail)$/.test(item.type))) {
      assert.deepEqual([node.retryOnFail, node.maxTries, node.waitBetweenTries], [true, 3, 5000], node.name);
    }
  }
});

test("lead-inbox: Gmail nodes never send to the sender", () => {
  const sends = workflows["lead-inbox.workflow.json"].nodes.filter(
    (node) => node.type === "n8n-nodes-base.gmail" && (node.parameters.operation ?? "send") === "send" && node.parameters.resource !== "draft",
  );
  assert.deepEqual(sends.map((node) => node.name), ["Send hot lead alert"]);
  assert.equal(sends[0].parameters.sendTo, "={{ $('Config').first().json.alert_to }}");
});

test("lead-inbox: spam goes to Run Log without a Leads row or draft", () => {
  const connections = workflows["lead-inbox.workflow.json"].connections["Route by category"].main;
  assert.deepEqual(connections[3].map((target) => target.node), ["Shape Run Log row"]);
});
