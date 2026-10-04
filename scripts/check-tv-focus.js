#!/usr/bin/env node
'use strict';

// Google TV / Android TV D-pad navigation has no visible "hover" the way a
// mouse cursor does, and nothing in this app's dependencies draws one for
// free (see src/shared/ui/tvFocus.ts's own comment for why: Pressable's
// android_ripple only fires on press, react-native-paper's TouchableRipple
// has its own focus support stubbed out upstream, this app isn't on the
// react-native-tvos fork so Pressable has no `focused` render-prop, and
// there's no native focus-highlight selector in styles.xml either). Every
// focusable element therefore has to track focus itself and apply a visible
// style manually -- this script statically verifies that every onPress-
// bearing interactive element in src/**/*.tsx also wires up onFocus, so a
// D-pad remote always has *something* visible to navigate by.
//
// Usage: node scripts/check-tv-focus.js   (exits 1 and lists gaps if any)
//
// Deliberately exempted: an element that genuinely isn't meant to be D-pad-
// focusable (e.g. a full-screen TouchableWithoutFeedback used only as a
// modal backdrop tap-to-dismiss catcher) can opt out with a
// `// tv-focus-exempt: <reason>` comment directly above it.
//
// Known blind spot: react-native-paper's <SegmentedButtons> takes its
// pressable segments as a `buttons` data array, not individual JSX elements
// with their own onPress attribute, so this AST check can't see them at
// all. Review those by hand if you add/change one.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SRC_DIR = path.join(__dirname, '..', 'src');
const EXEMPT_MARKER = 'tv-focus-exempt';

// react-native + react-native-paper's own leaf interactive components --
// deliberately NOT a list of this app's custom wrapper components (e.g.
// SettingItem, RailButton): once those wrappers wire up onFocus once in
// their own definition (which this script's walk over SettingItem.tsx/
// RailControls.tsx etc. already verifies, since the Pressable *inside* them
// matches a tag below), every call site reusing them is covered for free
// and shouldn't need to repeat onFocus itself.
const INTERACTIVE_TAGS = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Button',
  'IconButton',
  'Chip',
  'FAB',
  'Card',
  'List.Item',
  'RadioButton.Item',
  'Checkbox.Item',
]);

function collectFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (entry.isFile() && full.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function hasAttribute(attributes, name) {
  return attributes.properties.some(
    attr => ts.isJsxAttribute(attr) && attr.name.getText() === name,
  );
}

function checkFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings = [];

  const isExempt = node => {
    const leading = sourceFile.text.slice(node.getFullStart(), node.getStart());
    return leading.includes(EXEMPT_MARKER);
  };

  const visit = node => {
    let tagNameNode;
    let attributes;
    if (ts.isJsxSelfClosingElement(node)) {
      tagNameNode = node.tagName;
      attributes = node.attributes;
    } else if (ts.isJsxOpeningElement(node)) {
      tagNameNode = node.tagName;
      attributes = node.attributes;
    }

    if (tagNameNode && attributes) {
      const tagName = tagNameNode.getText();
      if (INTERACTIVE_TAGS.has(tagName)) {
        const hasOnPress = hasAttribute(attributes, 'onPress');
        const hasOnFocus = hasAttribute(attributes, 'onFocus');
        if (hasOnPress && !hasOnFocus && !isExempt(node)) {
          const {line} = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          findings.push({file: filePath, line: line + 1, tagName});
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function main() {
  const files = collectFiles(SRC_DIR, []);
  const findings = files.flatMap(checkFile);

  if (findings.length === 0) {
    console.log(
      `TV focus check passed -- ${files.length} files scanned, every onPress element wires up onFocus.`,
    );
    return;
  }

  console.error(
    `${findings.length} interactive element(s) across ${files.length} files are missing onFocus handling:\n`,
  );
  for (const f of findings) {
    const rel = path.relative(process.cwd(), f.file);
    console.error(`  ${rel}:${f.line}  <${f.tagName}> has onPress but no onFocus`);
  }
  console.error(
    `\nGoogle TV/Android TV D-pad navigation has no visible hover -- each element above needs an\n` +
      `onFocus/onBlur-driven style change (see src/shared/ui/tvFocus.ts's useTVFocus()). If one is\n` +
      `deliberately not meant to be D-pad-focusable, mark it with a comment directly above it:\n` +
      `  // ${EXEMPT_MARKER}: <reason>`,
  );
  process.exitCode = 1;
}

main();
