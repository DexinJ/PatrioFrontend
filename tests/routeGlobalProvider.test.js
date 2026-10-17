import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// React context only flows down the element tree, so a route can read
// `GlobalContext` only when a layout between it and the navigator root renders
// `<GlobalProvider>`. `app/legal/licenses.js` shipped without one, so
// `useContext(GlobalContext)` returned `undefined` and destructuring `theme`
// crashed the screen with "Cannot read property 'theme' of undefined"
// (Sentry REACT-NATIVE-D). Keep every route under a provider.
const APP_DIR = "app";
const PROVIDER_PATTERN = /<GlobalProvider[\s/>]/;
const CONSUMER_PATTERN = /\buseContext\s*\(\s*GlobalContext\s*\)/;

function collectRouteFiles(directory, acc = []) {
  for (const entry of readdirSync(join(process.cwd(), directory), {
    withFileTypes: true,
  })) {
    if (entry.name === "node_modules") continue;
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      collectRouteFiles(relativePath, acc);
    } else if (
      /\.(js|jsx)$/.test(entry.name) &&
      entry.name !== "_layout.js" &&
      entry.name !== "_layout.jsx"
    ) {
      acc.push(relativePath);
    }
  }
  return acc;
}

// Layouts that can wrap the route: its own directory and every ancestor up to
// the navigator root. Any one of them may supply the provider.
function ancestorLayouts(routeFile) {
  const segments = routeFile.split("/").slice(0, -1); // drop the file name
  const layouts = [];
  for (let depth = segments.length; depth >= 1; depth -= 1) {
    const directory = segments.slice(0, depth).join("/");
    for (const name of ["_layout.js", "_layout.jsx"]) {
      const candidate = `${directory}/${name}`;
      if (existsSync(join(process.cwd(), candidate))) layouts.push(candidate);
    }
  }
  return layouts;
}

test("every route that reads GlobalContext sits under a GlobalProvider layout", () => {
  const offenders = [];

  for (const routeFile of collectRouteFiles(APP_DIR)) {
    const source = readFileSync(join(process.cwd(), routeFile), "utf8");
    if (!CONSUMER_PATTERN.test(source)) continue;

    const layouts = ancestorLayouts(routeFile);
    const covered = layouts.some((layout) =>
      PROVIDER_PATTERN.test(readFileSync(join(process.cwd(), layout), "utf8"))
    );
    if (!covered) offenders.push(routeFile);
  }

  assert.deepEqual(
    offenders,
    [],
    "These routes read GlobalContext but no enclosing layout renders " +
      "<GlobalProvider>, so useContext(GlobalContext) returns undefined and " +
      `destructuring it throws. Offending file(s): ${offenders.join(", ")}`
  );
});
