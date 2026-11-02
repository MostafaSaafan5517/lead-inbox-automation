import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedPrompts } from "../scripts/sync-n8n-workflows.mjs";
import { allStrings, findSecretLikeStrings } from "./secret-scan.js";

const FILES = ["process-lead.blueprint.json", "email-intake.blueprint.json"];
const SECRET_PLACEHOLDER = "PASTE_WEBHOOK_SECRET_IN_EDITOR";
// Module ids and versions seen in the scenarios exported from a working Make account.
const KNOWN_MODULES = {
  "gateway:CustomWebHook": 1,
  "gateway:WebhookRespond": 1,
  "builtin:BasicRouter": 1,
  "builtin:Break": 1,
  "builtin:Ignore": 1,
  "util:SetVariables": 1,
  "json:ParseJSON": 1,
  "http:MakeRequest": 4,
  "google-sheets:addRow": 2,
  "google-sheets:makeAPICall": 2,
  "google-email:createADraft": 4,
  "google-email:sendAnEmail": 4,
  "google-email:updateEmailLabels": 4,
  "google-email:triggerWatchNewEmails": 4,
};
const SHEET_HEADERS = { Leads: "leads.csv", "Dead Letter": "dead-letter.csv", "Run Log": "run-log.csv" };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const raw = Object.fromEntries(FILES.map((file) => [file, read(`make/${file}`)]));
const blueprints = Object.fromEntries(FILES.map((file) => [file, JSON.parse(raw[file])]));
const dataStructures = JSON.parse(read("make/data-structures.json")).structures;

// Every module in the scenario, including router routes and error handler routes.
function allModules(flow, out = []) {
  for (const module of flow ?? []) {
    out.push(module);
    for (const route of module.routes ?? []) allModules(route.flow, out);
    allModules(module.onerror, out);
  }
  return out;
}

const processLead = allModules(blueprints["process-lead.blueprint.json"].flow);
const emailIntake = allModules(blueprints["email-intake.blueprint.json"].flow);

for (const file of FILES) {
  const blueprint = blueprints[file];
  const modules = allModules(blueprint.flow);

  test(`${file}: has a name and modules with integer ids`, () => {
    assert.equal(typeof blueprint.name, "string");
    assert.ok(modules.length > 0);
    for (const module of modules) assert.ok(Number.isInteger(module.id), `module without an integer id: ${module.module}`);
  });

  test(`${file}: module ids are unique`, () => {
    const ids = modules.map((module) => module.id);
    assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  });

  test(`${file}: uses only the module ids and versions of the working export`, () => {
    for (const module of modules) {
      assert.ok(module.module in KNOWN_MODULES, `module ${module.id} is ${module.module}`);
      assert.equal(module.version, KNOWN_MODULES[module.module], `module ${module.id} version`);
    }
  });

  test(`${file}: no string looks like a secret`, () => {
    assert.deepEqual(findSecretLikeStrings(blueprint), []);
  });

  test(`${file}: no em dash`, () => {
    assert.equal(raw[file].includes(String.fromCharCode(0x2014)), false);
  });

  test(`${file}: no webhook URL, spreadsheet URL or Gmail label id`, () => {
    assert.doesNotMatch(raw[file], /hook\.[a-z0-9]+\.make\.com/i);
    assert.doesNotMatch(raw[file], /docs\.google\.com/);
    assert.doesNotMatch(raw[file], /Label_\d+/);
  });

  test(`${file}: stores incomplete executions (needed by Retry) and does not process data in order`, () => {
    assert.equal(blueprint.metadata.scenario.dlq, true);
    assert.equal(blueprint.metadata.scenario.sequential, false);
  });
}

test("process-lead: every webhook secret check compares with the placeholder only", () => {
  const secretChecks = processLead
    .flatMap((module) => module.filter?.conditions.flat() ?? [])
    .filter((condition) => condition.a.includes("x-webhook-secret"));
  assert.equal(secretChecks.length, 4);
  for (const condition of secretChecks) assert.equal(condition.b, SECRET_PLACEHOLDER);
});

test("process-lead: every Sheets call uses the spreadsheet id placeholder", () => {
  for (const module of processLead.filter((module) => module.module === "google-sheets:addRow")) {
    assert.equal(module.mapper.spreadsheetId, "PASTE_SPREADSHEET_ID", `module ${module.id}`);
  }
  for (const module of processLead.filter((module) => module.module === "google-sheets:makeAPICall")) {
    assert.match(module.mapper.url, /^spreadsheets\/PASTE_SPREADSHEET_ID\//, `module ${module.id}`);
  }
});

test("process-lead: every Add a row writes RAW values and fills every column of its tab", () => {
  const writes = processLead.filter((module) => module.module === "google-sheets:addRow");
  assert.ok(writes.length > 0);
  for (const module of writes) {
    assert.equal(module.mapper.valueInputOption, "RAW", `module ${module.id}`);
    const header = read(`test-data/sheet-headers/${SHEET_HEADERS[module.mapper.sheetId]}`).trim().split(",");
    assert.equal(Object.keys(module.mapper.values).length, header.length, `module ${module.id} column count`);
  }
});

test("process-lead: the duplicate check reads the message_id column of Leads", () => {
  const leadsColumn = String.fromCharCode(65 + read("test-data/sheet-headers/leads.csv").split(",").indexOf("message_id"));
  const [leadsRead] = processLead.filter((module) => module.module === "google-sheets:makeAPICall");
  assert.match(leadsRead.mapper.url, new RegExp(`/values/Leads!${leadsColumn}2:${leadsColumn}$`));
});

test("process-lead: Gmail labels and the alert address are placeholders", () => {
  const labels = processLead.filter((module) => module.module === "google-email:updateEmailLabels");
  assert.deepEqual(labels.map((module) => module.mapper.addLabels).sort(), [
    "PASTE_COLD_LABEL_ID",
    "PASTE_HOT_LABEL_ID",
    "PASTE_JUNK_LABEL_ID",
    "PASTE_SUPPORT_LABEL_ID",
  ]);
  const alerts = processLead.filter((module) => module.module === "google-email:sendAnEmail");
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].mapper.to, ["PASTE_ALERT_EMAIL"]);
});

test("process-lead: prompts match prompts/", () => {
  const strings = allStrings(blueprints["process-lead.blueprint.json"]);
  const prompts = expectedPrompts();
  assert.ok(strings.includes(prompts.classify_system), "classify_system drifted from prompts/");
  const fromNormalize = new Set(["source", "body"]);
  const classifyUser = prompts.classify_user.replace(/\{\{(\w+)\}\}/g, (_, name) => `{{${fromNormalize.has(name) ? 30 : 1}.${name}}}`);
  assert.ok(strings.includes(classifyUser), "classify_user drifted from prompts/");
});

test("process-lead: the Gemini model id is set in one place and the key is not in the URL", () => {
  assert.equal(raw["process-lead.blueprint.json"].split("gemini-3.1-flash-lite").length - 1, 1);
  for (const module of processLead.filter((module) => module.module === "http:MakeRequest")) {
    assert.equal(module.parameters.authenticationType, "apiKeyConnection", `module ${module.id}`);
    assert.doesNotMatch(module.mapper.url, /[?&]key=/, `module ${module.id}`);
  }
});

test("email-intake: posts to the webhook URL placeholder with the secret placeholder", () => {
  const [post] = emailIntake.filter((module) => module.module === "http:MakeRequest");
  assert.equal(post.mapper.url, "PASTE_PROCESS_LEAD_WEBHOOK_URL");
  assert.deepEqual(post.mapper.headers, [{ name: "X-Webhook-Secret", value: SECRET_PLACEHOLDER }]);
});

test("email-intake: the Gmail search skips own mail, Make and Google notices, and labelled mail", () => {
  const [watch] = emailIntake.filter((module) => module.module === "google-email:triggerWatchNewEmails");
  for (const term of ["-from:me", "-from:make.com", "-from:google.com", "-label:HOT", "-label:COLD", "-label:SUPPORT", "-label:JUNK"]) {
    assert.ok(watch.parameters.q.split(" ").includes(term), `search lacks ${term}`);
  }
});

test("data-structures.json lists every data structure the blueprints use", () => {
  const used = [...processLead, ...emailIntake]
    .map((module) => module.mapper?.bodyDataStructure ?? (module.module === "json:ParseJSON" ? module.parameters.type : undefined))
    .filter((id) => id !== undefined);
  assert.deepEqual([...new Set(used)].sort(), dataStructures.map((structure) => structure.demo_id).sort());
  for (const structure of dataStructures) {
    assert.equal(typeof structure.name, "string");
    assert.ok(Array.isArray(structure.spec) && structure.spec.length > 0, structure.name);
  }
});

test("make/README and the build guide explain every PASTE_ placeholder", () => {
  const placeholders = new Set([...FILES.map((file) => raw[file]), read("make/data-structures.json")].join("\n").match(/PASTE_[A-Z_]+/g));
  assert.ok(placeholders.size > 0);
  for (const doc of ["make/README.md", "make/BUILD-GUIDE.md"]) {
    const text = read(doc);
    for (const placeholder of placeholders) assert.ok(text.includes(`\`${placeholder}\``), `${doc} does not list ${placeholder}`);
  }
});

test("README, make/README and the build guide reference both blueprints", () => {
  for (const doc of ["README.md", "make/README.md", "make/BUILD-GUIDE.md"]) {
    const text = read(doc);
    for (const file of FILES) assert.ok(text.includes(file), `${doc} does not mention ${file}`);
  }
});
