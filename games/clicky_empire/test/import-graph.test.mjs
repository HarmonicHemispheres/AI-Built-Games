// Static import-graph validator. Parses every src/**/*.js for relative imports
// and the exports of their targets, then asserts each named import resolves to a
// real export. Catches cross-module name mismatches that `node --check` misses
// and that otherwise only surface at browser load (three/DOM modules included,
// since this never executes them — it only reads source text).
//
// Run: node games/clicky_empire/test/import-graph.test.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "../src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Strip line + block comments so commented-out code isn't parsed.
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function exportsOf(src) {
  const names = new Set();
  let m;
  const add = (n) => n && names.add(n.trim());
  for (const re of [
    /export\s+function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
  ]) {
    while ((m = re.exec(src))) add(m[1]);
  }
  // export { a, b as c } [from "..."]
  const braceRe = /export\s*\{([^}]*)\}/g;
  while ((m = braceRe.exec(src))) {
    for (const part of m[1].split(",")) {
      const seg = part.trim();
      if (!seg) continue;
      const asMatch = seg.split(/\s+as\s+/);
      add(asMatch.length > 1 ? asMatch[1] : asMatch[0]);
    }
  }
  if (/export\s+default/.test(src)) names.add("default");
  return names;
}

// Returns [{ names:[srcName...], spec, hasDefault, defaultName }]
function importsOf(src) {
  const result = [];
  const re = /import\s+([^;]*?)\s+from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1].trim();
    const spec = m[2];
    const entry = { names: [], spec, hasDefault: false };
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(",")) {
        const seg = part.trim();
        if (!seg) continue;
        entry.names.push(seg.split(/\s+as\s+/)[0].trim()); // imported (source) name
      }
    }
    // default or namespace import (before the brace) — we only check named ones.
    const head = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    if (head && !head.startsWith("*")) entry.hasDefault = true;
    result.push(entry);
  }
  return result;
}

const files = walk(SRC);
const exportCache = new Map();
function getExports(path) {
  if (!exportCache.has(path)) {
    exportCache.set(path, exportsOf(decomment(readFileSync(path, "utf8"))));
  }
  return exportCache.get(path);
}

const problems = [];
let importsChecked = 0;

for (const file of files) {
  const src = decomment(readFileSync(file, "utf8"));
  for (const imp of importsOf(src)) {
    if (!imp.spec.startsWith(".")) continue; // skip bare specifiers (three, node:*)
    const target = resolve(dirname(file), imp.spec);
    let targetExports;
    try {
      targetExports = getExports(target);
    } catch {
      problems.push(`${relative(SRC, file)} imports missing module "${imp.spec}"`);
      continue;
    }
    for (const name of imp.names) {
      importsChecked++;
      if (!targetExports.has(name)) {
        problems.push(
          `${relative(SRC, file)} imports { ${name} } from "${imp.spec}" — not exported there`,
        );
      }
    }
  }
}

console.log(`Scanned ${files.length} modules, checked ${importsChecked} named imports.`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} import-graph problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("✓ Import graph is consistent — every named import resolves to a real export.");
