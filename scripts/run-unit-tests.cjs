/* global __dirname */
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const nodeMajor = Number(process.versions.node.split(".")[0]);
const testsDirectory = join(process.cwd(), "tests");
if (!existsSync(testsDirectory)) {
  // Without this the failure is a bare ENOENT from readdirSync, which reads like
  // a broken script rather than a missing suite.
  console.error(
    `No tests directory at ${testsDirectory}. Run this from the app root.`
  );
  process.exit(1);
}

const testFiles = readdirSync(testsDirectory)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => join("tests", name));
const moduleModeArgs =
  nodeMajor >= 24
    ? ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"]
    : ["--experimental-default-type=module"];
const result = spawnSync(
  process.execPath,
  [
    ...moduleModeArgs,
    "--import",
    pathToFileURL(join(__dirname, "i18n-test-setup.mjs")).href,
    "--test",
    ...testFiles,
  ],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
