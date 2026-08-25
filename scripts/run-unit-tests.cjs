/* global __dirname */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const nodeMajor = Number(process.versions.node.split(".")[0]);
const testFiles = readdirSync(join(process.cwd(), "tests"))
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
