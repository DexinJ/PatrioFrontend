#!/usr/bin/env node
// Generates assets/legal/licenses.json from the installed production dependency
// tree. The MIT, BSD, and Apache licences that cover Pantrio's dependencies all
// require their copyright notice and licence text to travel with the shipped
// app, so the output of this script is bundled into the app and rendered by
// app/legal/licenses.js.
//
// Run after any dependency change:
//   node scripts/build-licenses.cjs

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCK_PATH = path.join(ROOT, "package-lock.json");
const OUT_DIR = path.join(ROOT, "assets", "legal");
const OUT_PATH = path.join(OUT_DIR, "licenses.json");

// Ordered by preference: the first file that exists wins.
const LICENSE_FILE_NAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENSE.markdown",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "LICENSE-MIT",
  "LICENSE-MIT.txt",
  "LICENSE-APACHE",
  "LICENSE.BSD",
  "license",
  "license.md",
  "license.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
  "NOTICE",
  "NOTICE.md",
  "NOTICE.txt",
];

function readLicenceText(packageDir) {
  for (const fileName of LICENSE_FILE_NAMES) {
    const candidate = path.join(packageDir, fileName);
    if (!fs.existsSync(candidate)) continue;
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) continue;
    const text = fs.readFileSync(candidate, "utf8").trim();
    if (text) return text;
  }
  return "";
}

function normaliseLicence(entry) {
  const value = entry?.license;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type;
  }
  if (Array.isArray(entry?.licenses)) {
    return entry.licenses
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function main() {
  if (!fs.existsSync(LOCK_PATH)) {
    throw new Error(`package-lock.json not found at ${LOCK_PATH}`);
  }

  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  const seen = new Map();

  for (const [key, entry] of Object.entries(lock.packages || {})) {
    if (!key.startsWith("node_modules/")) continue;
    if (entry?.dev === true || entry?.link === true) continue;

    const packageDir = path.join(ROOT, key);
    if (!fs.existsSync(packageDir)) continue;

    const name =
      typeof entry.name === "string" && entry.name
        ? entry.name
        : key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const version = typeof entry.version === "string" ? entry.version : "";
    const id = `${name}@${version}`;
    if (seen.has(id)) continue;

    let licence = normaliseLicence(entry);
    let text = readLicenceText(packageDir);

    if (!text) {
      // Fall back to the package's own manifest when no licence file ships.
      const manifestPath = path.join(packageDir, "package.json");
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          licence = licence || normaliseLicence(manifest);
        } catch {
          // A malformed manifest should not abort the whole build.
        }
      }
    }

    seen.set(id, {
      name,
      version,
      license: licence || "See the package for licence terms",
      text,
    });
  }

  const packages = [...seen.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const payload = {
    generatedBy: "scripts/build-licenses.cjs",
    note:
      "Third-party licence notices for the open-source components included in " +
      "the Pantrio application. Regenerate after any dependency change.",
    packageCount: packages.length,
    packages,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(payload, null, 2);
  fs.writeFileSync(OUT_PATH, json, "utf8");

  const withText = packages.filter((item) => item.text).length;
  console.log(
    `Wrote ${packages.length} packages (${withText} with full licence text) ` +
      `to ${path.relative(ROOT, OUT_PATH)} — ${(
        Buffer.byteLength(json) / 1024
      ).toFixed(0)} KiB`
  );
}

main();
