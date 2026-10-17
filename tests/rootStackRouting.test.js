import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// expo-router removes a `<Stack.Protected>` group from the navigator whenever
// its guard is false, and React Navigation then falls back to the first
// remaining screen (`initialRouteName ?? routeNames[0]`). `app/legal/licenses`
// was never declared in the root layout, so while `useAuth().loading` was true
// — both groups guarded off — it stayed the only available screen and became
// the cold-start route instead of the home tab. Keep every top-level route
// declared, and keep the navigator unmounted until a destination exists.
const ROOT_LAYOUT = "app/_layout.js";
const APP_DIR = "app";

function topLevelRouteNames() {
  return readdirSync(join(process.cwd(), APP_DIR), { withFileTypes: true })
    .map((entry) => {
      if (entry.isDirectory()) return entry.name;
      if (!/\.(js|jsx)$/.test(entry.name)) return null;
      const name = entry.name.replace(/\.(js|jsx)$/, "");
      // `_layout` configures the navigator and `+...` files are system routes.
      return name.startsWith("_") || name.startsWith("+") ? null : name;
    })
    .filter(Boolean)
    .sort();
}

test("every top-level route is declared in the root Stack", () => {
  const source = readFileSync(join(process.cwd(), ROOT_LAYOUT), "utf8");
  const declared = new Set(
    [...source.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(
      (match) => match[1]
    )
  );
  const undeclared = topLevelRouteNames().filter(
    (name) => !declared.has(name)
  );

  assert.deepEqual(
    undeclared,
    [],
    "Routes that are not declared in the root layout stay in the navigator " +
      "when both protected groups are guarded off, so the first one becomes " +
      `the startup screen. Undeclared: ${undeclared.join(", ")}`
  );
});

test("the root Stack mounts only after the session has resolved", () => {
  const source = readFileSync(join(process.cwd(), ROOT_LAYOUT), "utf8");
  const loadingGuard = source.search(/\bif\s*\(\s*loading\s*\)\s*\{/);
  const stackMount = source.search(/<Stack\s+screenOptions/);

  assert.notEqual(loadingGuard, -1, "AppNavigator must bail out while loading");
  assert.notEqual(stackMount, -1, "the root Stack should still be rendered");
  assert.ok(
    loadingGuard < stackMount,
    "While `loading` is true both Stack.Protected groups are unmounted, so " +
      "the navigator must not render at all — otherwise it falls back to the " +
      "first available route instead of the home tab."
  );
});
