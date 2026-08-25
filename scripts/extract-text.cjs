/* global __dirname */
// extract-text.cjs
// Parses app source with Babel and collects candidate user-facing strings.
// This is a heuristic scanner: it flags JSX text, UI-style props, template
// literals, and Alert calls for review. It does NOT decide what is
// user-facing — that curation lives in locales/en.json.
//
// Usage: node scripts/extract-text.cjs [outfile]
// Default outfile: scripts/.strings-report.json

const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const ROOT = path.resolve(__dirname, "..");
const SRC_DIRS = ["app", "components", "context", "utils", "api", "auth", "modules"];
const OUT_DEFAULT = path.join(__dirname, ".strings-report.json");

// Prop names that are commonly user-facing in this codebase.
const UI_PROPS = new Set([
  "title",
  "headerTitle",
  "tabBarLabel",
  "label",
  "placeholder",
  "accessibilityLabel",
  "accessibilityHint",
  "header",
  "message",
  "text",
  "subtitle",
  "description",
  "hint",
  "helperText",
  "body",
  "name",
  "confirmText",
  "cancelText",
  "buttonTitle",
  "primaryLabel",
  "secondaryLabel",
  "emptyTitle",
  "emptyMessage",
  "emptyText",
  "sectionTitle",
  "searchPlaceholder",
  "footerText",
  "errorText",
  "statusLabel",
  "listEmptyTitle",
  "listEmptyMessage",
  "noticeTitle",
  "noticeMessage",
  "alertTitle",
  "alertMessage",
  "actionTitle",
  "actionLabel",
  "unitLabel",
  "sectionLabel",
  "badgeLabel",
  "tooltip",
  "summary",
  "explainer",
  "usageHint",
  "emptyStateTitle",
  "emptyStateMessage",
  "proposalTitle",
  "proposalMessage",
  "ariaLabel",
  "ariaHint",
  "keyboardHint",
  "textContentType",
]);

// Object-property keys ending in these words are usually display text.
const KEY_SUFFIX_RE = /(Title|Label|Message|Placeholder|Hint|Text|Description|Subtitle|Body|Header|Summary)$/;

function isLikelyText(value) {
  return /[\p{L}\p{N}]/u.test(value);
}

function stringValue(node) {
  if (!node) return null;
  if (node.type === "StringLiteral" || node.type === "Literal") {
    return typeof node.value === "string" ? node.value : null;
  }
  if (node.type === "TemplateLiteral") {
    let out = "";
    node.quasis.forEach((q, i) => {
      out += q.value.cooked || q.value.raw || "";
      if (i < node.expressions.length) {
        const e = node.expressions[i];
        let name = "value";
        if (e.type === "Identifier") name = e.name;
        else if (e.type === "MemberExpression") {
          const parts = [];
          let cur = e;
          while (cur.type === "MemberExpression") {
            parts.unshift(
              cur.property.type === "Identifier"
                ? cur.property.name
                : cur.property.value != null
                  ? String(cur.property.value)
                  : "?"
            );
            cur = cur.object;
          }
          if (cur.type === "Identifier") parts.unshift(cur.name);
          name = parts.join(".");
        }
        out += `{{${name}}}`;
      }
    });
    return out;
  }
  if (node.type === "JSXExpressionContainer") {
    return stringValue(node.expression);
  }
  return null;
}

function collect(file, ast) {
  const entries = [];
  const push = (line, kind, text, prop) => {
    if (!isLikelyText(text)) return;
    entries.push({ file, line, kind, prop: prop || null, text });
  };

  traverse(ast, {
    JSXText(p) {
      const text = p.node.value.replace(/\s+/g, " ").trim();
      push(p.node.loc?.start.line, "jsx-text", text);
    },
    JSXExpressionContainer(p) {
      if (p.parent.type === "JSXElement" || p.parent.type === "JSXFragment") {
        const s = stringValue(p.node.expression);
        if (s != null) push(p.node.loc?.start.line, "jsx-expr", s);
      }
    },
    JSXAttribute(p) {
      const name = p.node.name.name;
      if (!UI_PROPS.has(name) && !KEY_SUFFIX_RE.test(name)) return;
      const s = stringValue(p.node.value);
      if (s != null) push(p.node.loc?.start.line, "prop", s, name);
    },
    ObjectProperty(p) {
      const key = p.node.key;
      if (!key || (key.type !== "Identifier" && key.type !== "StringLiteral")) return;
      const name = key.type === "Identifier" ? key.name : String(key.value);
      if (!UI_PROPS.has(name) && !KEY_SUFFIX_RE.test(name)) return;
      const s = stringValue(p.node.value);
      if (s != null) push(p.node.loc?.start.line, "obj-prop", s, name);
    },
    CallExpression(p) {
      const callee = p.node.callee;
      const isAlert =
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Alert" &&
        (callee.property.name === "alert" || callee.property.name === "prompt");
      if (!isAlert) return;
      p.node.arguments.forEach((arg, i) => {
        if (i > 2) return;
        const s = stringValue(arg);
        if (s != null) push(p.node.loc?.start.line, "alert", s, i === 0 ? "title" : "message");
      });
    },
    TemplateLiteral(p) {
      if (p.parent.type === "JSXAttribute" || p.parent.type === "ObjectProperty") return;
      if (p.node.expressions.length === 0) return;
      const text = stringValue(p.node);
      if (text != null && /[\p{L}]/u.test(text) && text.length > 6) {
        push(p.node.loc?.start.line, "template", text);
      }
    },
  });

  return entries;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(js|cjs|mjs|jsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const outFile = process.argv[2] || OUT_DEFAULT;
  const files = [];
  for (const dir of SRC_DIRS) {
    walk(path.join(ROOT, dir), files);
  }

  const report = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    let code;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let ast;
    try {
      ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx"],
        errorRecovery: true,
      });
    } catch (err) {
      console.warn(`SKIP ${rel}: ${err.message}`);
      continue;
    }
    report.push(...collect(rel, ast));
  }

  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  const byFile = report.reduce((m, e) => {
    m[e.file] = (m[e.file] || 0) + 1;
    return m;
  }, {});
  console.log(`Wrote ${report.length} candidates to ${outFile}`);
  for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${f}`);
  }
}

main();
