import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  AI_DISCLOSURE_SETTINGS_VERSION,
  isAiDisclosureAcknowledged,
  needsAiDisclosure,
} = require("../utils/aiDisclosurePolicy.cjs");

test("a missing or malformed settings object is asked again", () => {
  assert.equal(isAiDisclosureAcknowledged(undefined), false);
  assert.equal(isAiDisclosureAcknowledged(null), false);
  assert.equal(isAiDisclosureAcknowledged({}), false);
  assert.equal(isAiDisclosureAcknowledged({ chat: null }), false);
  assert.equal(isAiDisclosureAcknowledged({ chat: [] }), false);
  assert.equal(needsAiDisclosure({ chat: { chatgptStyle: false } }), true);
});

test("only an explicit true at the current version counts", () => {
  assert.equal(
    isAiDisclosureAcknowledged({
      chat: {
        aiDisclosureAcknowledged: true,
        aiDisclosureVersion: AI_DISCLOSURE_SETTINGS_VERSION,
      },
    }),
    true
  );
  assert.equal(
    isAiDisclosureAcknowledged({
      chat: {
        aiDisclosureAcknowledged: "true",
        aiDisclosureVersion: AI_DISCLOSURE_SETTINGS_VERSION,
      },
    }),
    false
  );
});

test("an older disclosure version is asked again", () => {
  assert.equal(
    isAiDisclosureAcknowledged({
      chat: {
        aiDisclosureAcknowledged: true,
        aiDisclosureVersion: AI_DISCLOSURE_SETTINGS_VERSION - 1,
      },
    }),
    false
  );
  assert.equal(
    needsAiDisclosure({
      chat: { aiDisclosureAcknowledged: true, aiDisclosureVersion: 0 },
    }),
    true
  );
});

// A1 gated the composer, but the Fridge screen's photo capture and recipe request
// reach the same model, and so does a retry of an older failed turn. The rule is
// one hook now (hooks/useAiDisclosureGate.js); this guard is what stops a future
// send path from being added without it.
function readSourceFiles(directory, acc = []) {
  for (const entry of readdirSync(join(process.cwd(), directory), {
    withFileTypes: true,
  })) {
    if (entry.name === "node_modules") continue;
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) readSourceFiles(relativePath, acc);
    else if (/\.(js|jsx)$/.test(entry.name)) acc.push(relativePath);
  }
  return acc;
}

test("every chat send path lives in a file that uses the disclosure gate", () => {
  const senders = readSourceFiles("app").filter((file) =>
    /streamMessage\s*\(/.test(readFileSync(join(process.cwd(), file), "utf8"))
  );

  assert.ok(senders.length > 0, "expected at least one send path to guard");
  for (const file of senders) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(
      source,
      /useAiDisclosureGate/,
      `${file} calls streamMessage without the AI disclosure gate`
    );
  }
});

test("the gate is the hook, not a second copy of the rule", () => {
  const hook = readFileSync(
    join(process.cwd(), "hooks/useAiDisclosureGate.js"),
    "utf8"
  );
  // The decision must stay in the pure policy module.
  assert.match(hook, /isAiDisclosureAcknowledged/);

  for (const file of ["app/(tabs)/chat.js", "app/(tabs)/fridge.js"]) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(source, /useAiDisclosureGate/, `${file} must use the gate`);
    assert.equal(
      /isAiDisclosureAcknowledged/.test(source),
      false,
      `${file} should read the gate, not the raw policy rule`
    );
  }
});
