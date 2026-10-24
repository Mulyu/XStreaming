#!/usr/bin/env node
'use strict';

// Every colour the UI draws has to come from src/shared/config/palette.ts, so
// the look can be changed (or audited) in one file. This script walks every
// .ts/.tsx file under src/ and fails if a colour is written inline anywhere
// except that file:
//   - hex literals:           '#7AA2F7', '#fff', "#1A1B2680"
//   - colour functions:       rgb(...), rgba(...), hsl(...), hsla(...)
//   - CSS colour names:       color: 'white', fill="red", iconColor="grey"
//                             (only when used as the value of a colour-ish
//                              property/attribute; 'transparent' is allowed)
// It reads the AST, so colours mentioned in comments are ignored, and so are
// non-colour strings such as "#1" rank labels or "C#".
//
// It also reports palette tokens that nothing references (a token nobody uses
// is usually a colour that is still hard-coded somewhere else). Pass
// --strict-unused to make that a failure too.
//
// Usage: node scripts/check-palette.js [--strict-unused]
// Not covered: native Android resources and Java (android/), which are not
// styled from the React Native palette.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_DIR = path.join(__dirname, '..', 'src');
const PALETTE_FILE = path.join(SRC_DIR, 'shared', 'config', 'palette.ts');
const STRICT_UNUSED = process.argv.includes('--strict-unused');

const HEX =
  /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/g;
const COLOUR_FN = /\b(?:rgba?|hsla?)\s*\(/g;
const COLOUR_PROP = /(?:color|fill|stroke|tint|background|border)$/i;
const CSS_NAMES = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgrey darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray grey green greenyellow honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgrey lightgreen lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Name of the property / JSX attribute this expression ends up as the value
// of, looking through ternaries, ||/&&/??, parentheses, arrays and `as`.
function propName(node) {
  let cur = node;
  let p = cur.parent;
  while (
    p &&
    (ts.isConditionalExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isArrayLiteralExpression(p) ||
      ts.isAsExpression(p) ||
      (ts.isBinaryExpression(p) &&
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(p.operatorToken.kind)))
  ) {
    cur = p;
    p = cur.parent;
  }
  if (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
    return p.parent.name.getText();
  }
  if (p && ts.isPropertyAssignment(p) && p.initializer === cur) {
    return p.name.getText();
  }
  if (p && ts.isJsxAttribute(p)) {
    return p.name.getText();
  }
  return null;
}

function checkText(text, node, sf, file, findings) {
  const where = () => {
    const {line} = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${path.relative(path.join(__dirname, '..'), file)}:${line + 1}`;
  };
  for (const m of text.matchAll(HEX)) {
    const hex = m[0];
    // 3/4-digit hex that is all digits is far more likely a label ("#145").
    if (hex.length <= 5 && !/[a-fA-F]/.test(hex)) {
      continue;
    }
    findings.push({at: where(), found: hex});
  }
  for (const m of text.matchAll(COLOUR_FN)) {
    findings.push({at: where(), found: m[0].replace(/\s+/g, '')});
  }
  // fill="red" inside inline SVG strings
  for (const m of text.matchAll(
    /\b(?:fill|stroke|stop-color)=\\?["']([a-z]+)\\?["']/g,
  )) {
    if (CSS_NAMES.has(m[1])) {
      findings.push({at: where(), found: m[0]});
    }
  }
}

function scanFile(file, findings) {
  const sf = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkText(node.text, node, sf, file, findings);
      const name = propName(node);
      if (
        name &&
        COLOUR_PROP.test(name) &&
        CSS_NAMES.has(node.text.trim().toLowerCase())
      ) {
        const {line} = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({
          at: `${path.relative(path.join(__dirname, '..'), file)}:${line + 1}`,
          found: `${name}: '${node.text}'`,
        });
      }
    } else if (
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      checkText(node.text, node, sf, file, findings);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Dotted paths of every leaf in `export const palette = {...}`.
function paletteTokens() {
  const sf = ts.createSourceFile(
    PALETTE_FILE,
    fs.readFileSync(PALETTE_FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const tokens = [];
  const walk = (obj, prefix) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        continue;
      }
      const key = prop.name.getText();
      let init = prop.initializer;
      if (ts.isAsExpression(init)) {
        init = init.expression;
      }
      if (ts.isObjectLiteralExpression(init)) {
        walk(init, `${prefix}${key}.`);
      } else {
        tokens.push(`${prefix}${key}`);
      }
    }
  };
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'palette' &&
      node.initializer
    ) {
      let init = node.initializer;
      if (ts.isAsExpression(init)) {
        init = init.expression;
      }
      if (ts.isObjectLiteralExpression(init)) {
        walk(init, '');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return tokens;
}

const files = listSourceFiles(SRC_DIR).filter(f => f !== PALETTE_FILE);
const findings = [];
for (const file of files) {
  scanFile(file, findings);
}

let failed = false;
if (findings.length > 0) {
  failed = true;
  const byFile = new Map();
  for (const f of findings) {
    const file = f.at.split(':')[0];
    if (!byFile.has(file)) {
      byFile.set(file, []);
    }
    byFile.get(file).push(f);
  }
  console.error(
    `Colour literals found outside src/shared/config/palette.ts (${findings.length} in ${byFile.size} files):\n`,
  );
  for (const [file, list] of [...byFile.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.error(`  ${file} (${list.length})`);
    for (const f of list.slice(0, 6)) {
      console.error(`    ${f.at.split(':')[1]}: ${f.found}`);
    }
    if (list.length > 6) {
      console.error(`    ... ${list.length - 6} more`);
    }
  }
  console.error('\nUse a token from palette (or alpha(palette.x, n)) instead.');
}

const allText = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const unused = paletteTokens().filter(token => {
  const parts = token.split('.');
  // `palette.pad.ink` counts as used by `palette.pad.ink`, or by the whole
  // group being passed around (`palette.pad`).
  for (let i = parts.length; i >= 1; i--) {
    if (allText.includes(`palette.${parts.slice(0, i).join('.')}`)) {
      return false;
    }
  }
  return !new RegExp(
    `\\b${parts[parts.length - 1]}\\b[^\\n]*\\bpalette\\b`,
  ).test(allText);
});
if (unused.length > 0) {
  console[STRICT_UNUSED ? 'error' : 'log'](
    `\nUnused palette tokens (${unused.length}): ${unused.join(', ')}`,
  );
  if (STRICT_UNUSED) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  `Palette check passed -- ${files.length} files scanned, no colour literals outside palette.ts.`,
);
