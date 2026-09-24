#!/usr/bin/env node
// Detects divergence between src/'s actual structure and the target
// architecture (.claude/knowledge/architecture.md, Feature-Sliced Design).
//
// Run from the repo root: node .claude/skills/refactoring/detect-divergence.js
//
// Four checks:
//   1. Non-FSD top-level directories under src/ (not yet migrated to a
//      layer), ranked by line count smallest-first -- matches the
//      refactoring skill's own "order by size, smallest first" step.
//      Scoped to directories; loose top-level files (App.tsx, i18n.ts, ...)
//      conceptually belong to the app layer but are deliberately not
//      flagged here since moving them is high-risk, not a "smallest first"
//      candidate.
//   2. Public API violations: an import from outside a migrated slice that
//      reaches past its index.ts barrel into a segment directly.
//   3. Same-layer slice isolation violations: a file in one slice importing
//      another slice in the same layer directly (architecture.md: "Slices
//      ... never import each other directly").
//   4. Reverse-layer violations: an import from a lower layer to a higher
//      one (only checked between files that are both already classified
//      under a recognized FSD layer directory -- code under a non-FSD
//      directory from check 1 has no declared layer to check direction
//      against).
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const ts = require(path.join(REPO_ROOT, 'node_modules/typescript'));

// Layers top-to-bottom, per architecture.md -- higher rank may import
// lower, never the reverse. Layers marked "sliced" have per-domain
// subdirectories; app/shared don't.
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const LAYER_RANK = Object.fromEntries(
  LAYERS.map((l, i) => [l, LAYERS.length - i]),
);
const SLICED_LAYERS = new Set(['pages', 'widgets', 'features', 'entities']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const allFiles = walk(SRC_DIR);

// ---- Check 1: non-FSD top-level directories ----
const topDirs = fs
  .readdirSync(SRC_DIR, {withFileTypes: true})
  .filter(e => e.isDirectory())
  .map(e => e.name);
const nonFsdDirs = topDirs.filter(d => !LAYERS.includes(d));

const dirStats = nonFsdDirs.map(d => {
  const prefix = path.join(SRC_DIR, d) + path.sep;
  const dirFiles = allFiles.filter(f => f.startsWith(prefix));
  const lines = dirFiles.reduce(
    (sum, f) => sum + fs.readFileSync(f, 'utf8').split('\n').length,
    0,
  );
  return {dir: d, files: dirFiles.length, lines};
});
dirStats.sort((a, b) => a.lines - b.lines);

// ---- Classify every file by layer/slice/segment ----
function classify(absFile) {
  const rel = path.relative(SRC_DIR, absFile);
  const parts = rel.split(path.sep);
  const [layer, second, third] = parts;
  if (!LAYERS.includes(layer)) return null;
  if (!SLICED_LAYERS.has(layer)) {
    // app/shared: no slices -- segment is the first path part after the
    // layer (e.g. shared/config/theme.ts -> segment "config").
    return {layer, slice: null, segment: second ?? null, file: absFile};
  }
  if (layer === 'pages') {
    // pages/ is currently flat screen files, not slice folders -- treat
    // each file as its own implicit slice so isolation checks still mean
    // something (one screen importing another directly would still be
    // flagged), without requiring pages/ to be restructured first.
    return {
      layer,
      slice: second ? second.replace(/\.(ts|tsx)$/, '') : null,
      segment: null,
      file: absFile,
    };
  }
  // features/entities/widgets: <layer>/<slice>/<segment>/... -- the slice's
  // own index.ts/index.tsx *is* the public API barrel, not a "segment".
  const isBarrel = third === 'index.ts' || third === 'index.tsx';
  return {
    layer,
    slice: second ?? null,
    segment: isBarrel ? null : third ?? null,
    file: absFile,
  };
}

const classified = new Map();
for (const f of allFiles) {
  const c = classify(f);
  if (c) classified.set(f, c);
}

// ---- Parse imports (and re-exports) via the TS compiler's own parser ----
function getImportSpecifiers(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specs = [];
  ts.forEachChild(sf, function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  });
  return specs;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // a package import, not internal
  const resolved = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    path.join(resolved, 'index.ts'),
    path.join(resolved, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

const publicApiViolations = [];
const sliceIsolationViolations = [];
const reverseLayerViolations = [];

for (const [file, info] of classified) {
  const specs = getImportSpecifiers(file);
  for (const spec of specs) {
    const resolved = resolveImport(file, spec);
    if (!resolved || resolved === file) continue;
    const targetInfo = classify(resolved);
    if (!targetInfo) continue; // target isn't under a recognized layer

    const sameSlice =
      info.layer === targetInfo.layer && info.slice === targetInfo.slice;
    if (sameSlice) continue; // internal import within the same slice: fine

    // Check 2: reaching into a slice's segment from outside it, instead of
    // importing its index.ts barrel (segment === null means "the barrel").
    if (
      SLICED_LAYERS.has(targetInfo.layer) &&
      targetInfo.layer !== 'pages' &&
      targetInfo.segment !== null
    ) {
      publicApiViolations.push({
        from: path.relative(SRC_DIR, file),
        to: path.relative(SRC_DIR, resolved),
        spec,
      });
    }

    // Check 3: same layer, different slice.
    if (
      SLICED_LAYERS.has(info.layer) &&
      info.layer === targetInfo.layer &&
      info.slice !== targetInfo.slice
    ) {
      sliceIsolationViolations.push({
        from: path.relative(SRC_DIR, file),
        to: path.relative(SRC_DIR, resolved),
        layer: info.layer,
      });
    }

    // Check 4: importer's layer ranks lower than the target's (a lower
    // layer must never import a higher one).
    if (LAYER_RANK[info.layer] < LAYER_RANK[targetInfo.layer]) {
      reverseLayerViolations.push({
        from: path.relative(SRC_DIR, file),
        fromLayer: info.layer,
        to: path.relative(SRC_DIR, resolved),
        toLayer: targetInfo.layer,
      });
    }
  }
}

// ---- Report ----
console.log('=== 1. Non-FSD top-level directories (smallest first) ===');
if (dirStats.length === 0) {
  console.log('  none -- every src/ top-level directory matches a layer name.');
} else {
  for (const s of dirStats) {
    console.log(`  src/${s.dir}/  files=${s.files}  lines=${s.lines}`);
  }
}

console.log(
  "\n=== 2. Public API violations (import reaches past a slice's index.ts) ===",
);
if (publicApiViolations.length === 0) {
  console.log('  none found.');
} else {
  for (const v of publicApiViolations) {
    console.log(`  ${v.from}\n    -> ${v.spec}  (resolves to ${v.to})`);
  }
}

console.log('\n=== 3. Same-layer slice isolation violations ===');
if (sliceIsolationViolations.length === 0) {
  console.log('  none found.');
} else {
  for (const v of sliceIsolationViolations) {
    console.log(`  [${v.layer}] ${v.from} -> ${v.to}`);
  }
}

console.log(
  '\n=== 4. Reverse-layer violations (lower layer importing a higher one) ===',
);
if (reverseLayerViolations.length === 0) {
  console.log('  none found.');
} else {
  for (const v of reverseLayerViolations) {
    console.log(`  [${v.fromLayer} -> ${v.toLayer}] ${v.from} -> ${v.to}`);
  }
}

const total =
  dirStats.length +
  publicApiViolations.length +
  sliceIsolationViolations.length +
  reverseLayerViolations.length;
console.log(`\nTotal divergence items: ${total}`);
process.exitCode = total > 0 ? 1 : 0;
