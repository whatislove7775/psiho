#!/usr/bin/env node
/**
 * Lists UI strings that a dictionary is missing (and keys nobody uses any more).
 *   node scripts/i18n-check.mjs            → summary for en
 *   node scripts/i18n-check.mjs en --json  → missing keys as JSON (for translators)
 * Collects the first argument of t()/tj()/msg() (and their aliases tt/tjx), translatedList([...]) items and
 * plural(n, "one", "few", "many") forms (dictionary key "one|few|many").
 */
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locale = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "en";
const asJson = process.argv.includes("--json");

const CALLS = new Set(["t", "tt", "tj", "tjx", "msg"]);
const norm = (s) => s.replace(/ /g, " ");

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts")) yield p;
  }
}

const used = new Map(); // key → first location
const lit = (n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
for (const file of walk(join(root, "src"))) {
  if (/\/lib\/i18n\/|\/app\/admin\/|\/components\/admin\/|\/app\/dev\//.test(file)) continue;
  const src = readFileSync(file, "utf8");
  if (!/\b(t|tt|tj|tjx|tc|msg|plural|translatedList)\(/.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (key, node) => {
    if (key && /[А-Яа-яЁё]/.test(key) && !used.has(norm(key))) used.set(norm(key), `${file.slice(root.length + 1)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
  };
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (CALLS.has(name)) add(lit(n.arguments[0]), n);
      else if (name === "tc" && lit(n.arguments[0]) !== null && lit(n.arguments[1]) !== null) {
        add(`${lit(n.arguments[0])}::${lit(n.arguments[1])}`, n);
      }
      else if (name === "plural" && n.arguments.length === 4) {
        const forms = n.arguments.slice(1).map(lit);
        if (forms.every((f) => f !== null)) add(forms.join("|"), n);
      } else if (name === "translatedList" && n.arguments[0]) {
        let arr = n.arguments[0];
        if (ts.isAsExpression(arr)) arr = arr.expression;
        if (ts.isArrayLiteralExpression(arr)) arr.elements.forEach((e) => add(lit(e), e));
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}

const dictSrc = readFileSync(join(root, `src/lib/i18n/dict/${locale}.ts`), "utf8");
const dsf = ts.createSourceFile("d.ts", dictSrc, ts.ScriptTarget.Latest, true);
const have = new Set();
(function visit(n) {
  if (ts.isPropertyAssignment(n)) { const k = lit(n.name); if (k !== null) have.add(norm(k)); }
  ts.forEachChild(n, visit);
})(dsf);

const missing = [...used.keys()].filter((k) => !have.has(k));
const unused = [...have].filter((k) => !used.has(k));
if (asJson) {
  console.log(JSON.stringify(Object.fromEntries(missing.map((k) => [k, used.get(k)])), null, 1));
} else {
  console.log(`${locale}: ${used.size} strings, ${missing.length} missing, ${unused.length} unused`);
  for (const k of missing.slice(0, 30)) console.log(`  missing  ${used.get(k)}  ${JSON.stringify(k).slice(0, 90)}`);
  for (const k of unused.slice(0, 10)) console.log(`  unused   ${JSON.stringify(k).slice(0, 90)}`);
}
process.exitCode = missing.length ? 1 : 0;
