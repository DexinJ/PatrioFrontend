/* global __dirname */
// check-i18n-keys.cjs
// Verifies every translation key referenced by t() / i18next.t() in the app
// source exists in locales/en.json. Exits non-zero with a list when keys are
// missing so the catalog and code cannot drift silently.
// Usage: node scripts/check-i18n-keys.cjs
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const en = require(path.join(ROOT, "locales", "en.json"));
const SRC_DIRS = [
  "app",
  "components",
  "context",
  "utils",
  "api",
  "auth",
  "i18n",
];

function hasKey(key) {
  const resolve = (candidate) =>
    candidate
      .split(".")
      .reduce((node, part) => node?.[part], en);
  if (resolve(key) !== undefined) return true;
  // i18next resolves plural forms (base_one / base_other) from the base key.
  return resolve(`${key}_one`) !== undefined || resolve(`${key}_other`) !== undefined;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|cjs|mjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = [];
for (const dir of SRC_DIRS) {
  walk(path.join(ROOT, dir), files);
}

const usedKeys = new Set();
const KEY_RE = /(?:^|[^A-Za-z0-9_.])t\(\s*["'`]([^"'`]+)["'`]/g;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let match;
  while ((match = KEY_RE.exec(source))) {
    const key = match[1];
    if (key.startsWith("tags.") || key.includes("{{")) continue;
    usedKeys.add(key);
  }
}

const missing = [...usedKeys].filter((key) => !hasKey(key)).sort();

if (missing.length) {
  console.error(`Missing ${missing.length} key(s) in locales/en.json:`);
  for (const key of missing) console.error(`  ${key}`);
  process.exit(1);
}

console.log(
  `OK: ${usedKeys.size} translation key(s) used in code, all present in locales/en.json.`
);

// Every locale file must mirror en.json's key set exactly so translated apps
// never fall back to raw keys for missing entries.
const localeFiles = fs
  .readdirSync(path.join(ROOT, "locales"))
  .filter((name) => /^[a-z-]+\.json$/.test(name));

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object"
      ? flattenKeys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

const englishKeys = new Set(flattenKeys(en));
let failed = false;

for (const name of localeFiles) {
  if (name === "en.json") continue;
  const locale = require(path.join(ROOT, "locales", name));
  const localeKeySet = new Set(flattenKeys(locale));
  const missingKeys = [...englishKeys].filter((key) => !localeKeySet.has(key));
  const extraKeys = [...localeKeySet].filter((key) => !englishKeys.has(key));
  if (missingKeys.length || extraKeys.length) {
    failed = true;
    console.error(`${name} key mismatch with en.json:`);
    if (missingKeys.length) {
      console.error(`  missing: ${missingKeys.join(", ")}`);
    }
    if (extraKeys.length) {
      console.error(`  extra: ${extraKeys.join(", ")}`);
    }
  }
}

if (failed) process.exit(1);
console.log(
  `OK: ${localeFiles.length} locale file(s) mirror en.json's key set exactly.`
);
