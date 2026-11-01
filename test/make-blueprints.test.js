import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedPrompts } from "../scripts/sync-n8n-workflows.mjs";
import { allStrings, findSecretLikeStrings } from "./secret-scan.js";

const FILES = ["process-lead.blueprint.json", "email-intake.blueprint.json"];
const SECRET_PLACEHOLDER = "PASTE_WEBHOOK_SECRET_IN_EDITOR";
// Keys that hold account-specific ids (connections, webhooks, keychains, data structures) in an export.
const ACCOUNT_ID_KEYS = ["__IMTCONN__", "hook", "apiKeyKeychain", "type"];

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const raw = Object.fromEntries(FILES.map((file) => [file, read(`make/${file}`)]));
const blueprints = Object.fromEntries(FILES.map((file) => [file, JSON.parse(raw[file])]));

// Every module in the scenario, including router routes and error handler routes.
function allModules(flow, out = []) {
  for (const module of flow ?? []) {
    out.push(module);
    for (const route of module.routes ?? []) allModules(route.flow, out);
    allModules(module.onerror, out);
  }
  return out;
}

for (const file of FILES) {
  const blueprint = blueprints[file];
  const modules = allModules(blueprint.flow);

  test(`${file}: has a name, modules and scenario metadata`, () => {
    assert.equal(typeof blueprint.name, "string");
    assert.ok(modules.length > 0);
    for (const module of modules) {
      assert.ok(Number.isInteger(module.id), `module without an integer id: ${module.module}`);
      assert.match(module.module, /^[a-z0-9-]+:[A-Za-z0-9]+$/, `module ${module.id}`);
    }
  });

  test(`${file}: module ids are unique`, () => {
    const ids = modules.map((module) => module.id);
    assert.deepEqual(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  });

  test(`${file}: no string looks like a secret`, () => {
    assert.deepEqual(findSecretLikeStrings(blueprint), []);
  });

  test(`${file}: no em dash`, () => {
    assert.equal(raw[file].includes(String.fromCharCode(0x2014)), false);
  });

  test(`${file}: no connection, webhook, keychain or data structure ids`, () => {
    for (const module of modules) {
      for (const key of ACCOUNT_ID_KEYS) {
        if (module.parameters && key in module.parameters) {
          assert.equal(module.parameters[key], null, `module ${module.id} has ${key}`);
        }
      }
    }
  });

  test(`${file}: stores incomplete executions, needed by the Retry handler`, () => {
    assert.equal(blueprint.metadata.scenario.dlq, true);
  });
}

test("process-lead: the webhook secret is only a placeholder", () => {
  const secretChecks = allModules(blueprints["process-lead.blueprint.json"].flow)
    .flatMap((module) => module.filter?.conditions.flat() ?? [])
    .filter((condition) => condition.a.includes("x-webhook-secret"));
  assert.equal(secretChecks.length, 2);
  for (const condition of secretChecks) assert.equal(condition.b, SECRET_PLACEHOLDER);
});

test("process-lead: prompts match prompts/", () => {
  const strings = allStrings(blueprints["process-lead.blueprint.json"]);
  const prompts = expectedPrompts();
  for (const name of ["classify_system", "repair_system"]) {
    assert.ok(strings.includes(prompts[name]), `${name} drifted from prompts/`);
  }
  const classifyUser = prompts.classify_user.replace(/\{\{(\w+)\}\}/g, "{{4.$1}}");
  assert.ok(strings.includes(classifyUser), "classify_user drifted from prompts/");
});

test("process-lead: the Gemini model id is set in one place only", () => {
  assert.equal(raw["process-lead.blueprint.json"].split("gemini-3.1-flash-lite").length - 1, 1);
});

test("README, make/README and the build guide reference both blueprints", () => {
  for (const doc of ["README.md", "make/README.md", "make/BUILD-GUIDE.md"]) {
    const text = read(doc);
    for (const file of FILES) assert.ok(text.includes(file), `${doc} does not mention ${file}`);
  }
});

test("process-lead: Dead Letter and Run Log rows are added only when their key is not in the tab yet", () => {
  const deadLetterColumns = read("test-data/sheet-headers/dead-letter.csv").trim().split(",");
  const flows = [];
  (function collect(flow) {
    flows.push(flow);
    for (const module of flow ?? []) {
      for (const route of module.routes ?? []) collect(route.flow);
      if (module.onerror) collect(module.onerror);
    }
  })(blueprints["process-lead.blueprint.json"].flow);

  const writes = flows.flatMap((flow) =>
    flow.map((module, index) => ({ module, before: flow[index - 1] })).filter(({ module }) => module.module === "google-sheets:addRow"),
  );
  const checked = writes.filter(({ module }) => ["Dead Letter", "Run Log"].includes(module.mapper.sheetId));
  assert.equal(checked.length, 4);
  for (const { module, before } of checked) {
    const keyColumn = module.mapper.sheetId === "Dead Letter" ? "H" : "D";
    assert.equal(before.module, "google-sheets:makeApiCall", `module ${module.id} has no read before it`);
    assert.match(before.mapper.url, new RegExp(`!${keyColumn}:${keyColumn}$`), `module ${before.id} reads the wrong column`);
    const [condition] = module.filter.conditions.flat();
    assert.deepEqual([condition.a, condition.o], [`{{flatten(${before.id}.body.values)}}`, "array:notcontain"], `module ${module.id}`);
    if (module.mapper.sheetId === "Dead Letter") {
      assert.equal(Object.keys(module.mapper.values).length, deadLetterColumns.length, `module ${module.id} column count`);
      assert.equal(module.mapper.values[String(deadLetterColumns.indexOf("dead_letter_key"))], condition.b, `module ${module.id} key`);
      assert.match(condition.b, /:[a-z ]+$/, `module ${module.id} key has no stage`);
    } else {
      assert.equal(condition.b, module.mapper.values[String(read("test-data/sheet-headers/run-log.csv").split(",").indexOf("message_id"))]);
    }
  }
});
