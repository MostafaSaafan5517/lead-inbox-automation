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
