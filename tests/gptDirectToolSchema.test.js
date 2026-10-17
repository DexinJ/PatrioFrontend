import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// api/gpt.js pulls in react-native and Expo modules, so it cannot be imported
// here. The tool list is asserted from source instead, the same way
// gptToolOwnership.test.js reads gptTools.js.
const source = readFileSync(new URL("../api/gpt.js", import.meta.url), "utf8");

test("the direct tool list offers exactly one batch shopping tool", () => {
  assert.match(source, /\["massAddShoppingItems",/);
  assert.match(
    source,
    /items: \{ type: "array", minItems: 1, maxItems: 40, items: shoppingListItemField \}/
  );
  // The single-item tool must not grow a plural twin that differs only by "s".
  assert.doesNotMatch(source, /"addShoppingItems"/);
});

test("the client advertises the batch capability it can execute", () => {
  assert.match(source, /CLIENT_TOOL_CAPABILITIES = Object\.freeze\(\["massAddShoppingItems"\]\)/);
  assert.match(source, /clientCapabilities: CLIENT_TOOL_CAPABILITIES/);
});
