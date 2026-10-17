import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// React Native 0.86 removed `StyleSheet.absoluteFillObject` (only
// `absoluteFill` is exported now). Because `{ ...undefined }` is a silent
// no-op, a style written that way keeps every other property but loses
// `position: "absolute"` and its insets, so the view renders in normal flow
// instead of overlaying. Nothing else catches it: it is valid JavaScript, it
// type-checks, and ESLint has no rule for it.
const SOURCE_DIRS = [
  "app",
  "components",
  "context",
  "utils",
  "api",
  "auth",
  "modules",
];

function collectJavaScriptFiles(directory, acc = []) {
  for (const entry of readdirSync(join(process.cwd(), directory), {
    withFileTypes: true,
  })) {
    if (entry.name === "node_modules") continue;
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectJavaScriptFiles(relativePath, acc);
    else if (/\.(js|jsx)$/.test(entry.name)) acc.push(relativePath);
  }
  return acc;
}

test("no source file uses the removed StyleSheet.absoluteFillObject export", () => {
  const offenders = [];

  for (const directory of SOURCE_DIRS) {
    for (const file of collectJavaScriptFiles(directory)) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      // Comments talk about the removed export on purpose, so only real code
      // lines count as a usage.
      const usesRemovedExport = source
        .split(/\r?\n/)
        .some((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("//")) return false;
          if (trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
          return trimmed.includes("absoluteFillObject");
        });
      if (usesRemovedExport) offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `React Native 0.86 no longer exports absoluteFillObject, so spreading it ` +
      `silently drops the positioning. Write the absolute-fill properties ` +
      `explicitly instead. Offending file(s): ${offenders.join(", ")}`
  );
});
