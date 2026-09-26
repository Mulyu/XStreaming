#!/usr/bin/env node
// Detects divergence between src/'s actual structure and the target
// architecture (.claude/knowledge/architecture.md, Feature-Sliced Design).
//
// Run from the repo root: node .claude/skills/refactoring/detect-divergence.js
//
// Six checks:
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
//   5. Page composition violations: for a page slice that has opted into
//      the ui/model/index pattern (signaled by having a model/
//      subdirectory at all), a ui/ file that calls a hook, or a model/
//      file that renders JSX (architecture.md: "Page slices specifically
//      ..."). Scoped to slices with a model/ dir so pages that haven't
//      adopted the pattern yet (a flat screen file, or a folder like
//      pages/native-stream/ whose ui/ predates this convention) aren't
//      flagged.
//   6. Flat slice files: a .ts/.tsx file placed directly under a sliced
//      layer (pages/widgets/features/entities) instead of its own
//      <layer>/<slice>/ folder (architecture.md: "always a folder ...
//      never a loose file directly under a sliced layer"), ranked by line
//      count smallest-first -- same "tackle the smallest first" convention
//      as check 1. app/shared are excluded -- they have no slices.
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

// ---- Check 5: page composition violations (ui/model segment purity) ----
// Deliberately strict per architecture.md: ANY hook call in ui/ (including
// presentational ones like useTheme/useTranslation) counts, and ANY JSX in
// model/ counts -- not just React's built-in hooks/state.
const HOOK_CALL_RE = /^use[A-Z0-9]/;

function containsHookCall(absFile) {
  const source = fs.readFileSync(absFile, 'utf8');
  const sf = ts.createSourceFile(
    absFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;
  ts.forEachChild(sf, function visit(node) {
    if (found) return;
    // Matches both `useFoo(...)` and the `React.useFoo(...)` member-access
    // style this codebase commonly uses (no destructured hook imports).
    const callee = ts.isCallExpression(node) ? node.expression : null;
    const calleeName = callee
      ? ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null
      : null;
    if (calleeName && HOOK_CALL_RE.test(calleeName)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  });
  return found;
}

function containsJsx(absFile) {
  const source = fs.readFileSync(absFile, 'utf8');
  const sf = ts.createSourceFile(
    absFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;
  ts.forEachChild(sf, function visit(node) {
    if (found) return;
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  });
  return found;
}

const pageSlicesWithModel = new Set();
const pagesDir = path.join(SRC_DIR, 'pages');
if (fs.existsSync(pagesDir)) {
  for (const entry of fs.readdirSync(pagesDir, {withFileTypes: true})) {
    if (entry.isDirectory() && fs.existsSync(path.join(pagesDir, entry.name, 'model'))) {
      pageSlicesWithModel.add(entry.name);
    }
  }
}

const pageCompositionViolations = [];
for (const file of allFiles) {
  const parts = path.relative(SRC_DIR, file).split(path.sep);
  if (parts[0] !== 'pages' || parts.length < 3) continue;
  const [, slice, segment] = parts;
  if (!pageSlicesWithModel.has(slice)) continue; // hasn't opted into the pattern
  const rel = path.relative(SRC_DIR, file);
  if (segment === 'ui' && containsHookCall(file)) {
    pageCompositionViolations.push({
      file: rel,
      issue: 'ui/ file calls a hook -- hooks belong in model/',
    });
  }
  if (segment === 'model' && containsJsx(file)) {
    pageCompositionViolations.push({
      file: rel,
      issue: 'model/ file contains JSX -- rendering belongs in ui/',
    });
  }
}

// ---- Check 6: flat slice files (should be their own folder slice) ----
const flatSliceFiles = [];
for (const layer of SLICED_LAYERS) {
  const layerDir = path.join(SRC_DIR, layer);
  if (!fs.existsSync(layerDir)) continue;
  for (const entry of fs.readdirSync(layerDir, {withFileTypes: true})) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
    const full = path.join(layerDir, entry.name);
    const lines = fs.readFileSync(full, 'utf8').split('\n').length;
    flatSliceFiles.push({file: path.relative(SRC_DIR, full), lines});
  }
}
flatSliceFiles.sort((a, b) => a.lines - b.lines);

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

console.log(
  '\n=== 5. Page composition violations (ui/model segment purity) ===',
);
if (pageCompositionViolations.length === 0) {
  console.log('  none found.');
} else {
  for (const v of pageCompositionViolations) {
    console.log(`  ${v.file}\n    ${v.issue}`);
  }
}

console.log(
  '\n=== 6. Flat slice files (should be their own folder slice) ===',
);
if (flatSliceFiles.length === 0) {
  console.log(
    '  none -- every pages/widgets/features/entities file sits inside a slice folder.',
  );
} else {
  for (const f of flatSliceFiles) {
    console.log(`  ${f.file}  lines=${f.lines}`);
  }
}

const total =
  dirStats.length +
  publicApiViolations.length +
  sliceIsolationViolations.length +
  reverseLayerViolations.length +
  pageCompositionViolations.length +
  flatSliceFiles.length;
console.log(`\nTotal divergence items: ${total}`);
process.exitCode = total > 0 ? 1 : 0;
