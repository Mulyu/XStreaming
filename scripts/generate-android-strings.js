#!/usr/bin/env node
'use strict';

// Generates Android string resources for the Jetpack Compose Settings
// screen (android/.../com/xstreaming/settings) from this app's own JS
// translation files (src/shared/config/languages/{en,ja}.ts) -- English and
// Japanese only, per explicit direction; the other 7 languages this app
// otherwise supports are not needed there. The Compose screen has no JS/RN
// bridge at all, so it can't call into i18next at runtime the way the rest
// of the app does -- these generated resources are its only source of
// translated strings, resolved by Android's own locale-aware resource
// system instead.
//
// Only the keys the Settings screen (src/features/app-settings,
// src/pages/settings) actually uses are included, not this app's whole
// translation set -- see SETTINGS_KEYS below. If the Settings UI starts
// using a new translation key, add it there and re-run this script.
//
// i18next's {{name}} named placeholders become Android's positional
// %1$s/%2$s/... (in order of first appearance in that key's English text --
// the same order must be used for both locales, so a caller's positional
// args apply correctly regardless of which language is active).
//
// Usage: node scripts/generate-android-strings.js
// Writes:
//   android/app/src/main/res/values/settings_strings.xml (English/default)
//   android/app/src/main/res/values-ja/settings_strings.xml (Japanese)

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const REPO_ROOT = path.join(__dirname, '..');
const LANGUAGES_DIR = path.join(REPO_ROOT, 'src/shared/config/languages');
const RES_DIR = path.join(REPO_ROOT, 'android/app/src/main/res');

// Extracted with a one-off script that walks the TS AST of every file below
// looking for `t('...')` call expressions (a plain grep missed calls whose
// string argument spans multiple lines, e.g. a long description wrapped onto
// its own line) -- then hand-verified against the source for keys that are
// only referenced indirectly (a variable holding the key name, not a literal
// t('...') call: useSettingsScreen.ts's xboxPlaytimeDescription() builds its
// ad-supported/ad-free-unlimited key names this way) and for a currently
// commented-out settings row (fsr_sharpness) whose keys are harmless to keep
// generating in case it's re-enabled later:
//   src/features/app-settings/*.ts, src/pages/settings/ui/SettingsView.tsx,
//   src/pages/settings/model/useSettingsScreen.ts, src/pages/settings/index.tsx
const SETTINGS_KEYS = [
  'Anti-idle max duration (minutes)',
  'AntiIdleMaxDesc',
  'App language',
  'Australia',
  'Auto',
  'BasesSettings',
  'Brazil1',
  'Brazil2',
  'Cancel',
  'Central India',
  'Changing the region allows you to use XGPU services without a proxy',
  'Codec',
  'CommonSettings',
  'Config joystick dead zone',
  'Confirm',
  'Current user',
  'Custom',
  'Default',
  'Disable',
  'DisplaySettings',
  'Do you want to logout?',
  'Enable',
  'Europe',
  'GamepadSettings',
  'GfnAccountSignedOutDesc',
  'GfnAccountTitle',
  'GfnBitrateDesc',
  'GfnBitrateTitle',
  'GfnFpsDesc',
  'GfnFpsTitle',
  'GfnNativeWebRtcDesc',
  'GfnNativeWebRtcTitle',
  'GfnPlaytimeLoading',
  'GfnPlaytimeRemaining',
  'GfnPlaytimeSignedOutDesc',
  'GfnPlaytimeTitle',
  'GfnPlaytimeUnavailable',
  'GfnPlaytimeUnlimited',
  'GfnQueueLoading',
  'GfnQueueTitle',
  'GfnQueueUnavailable',
  'GfnQueueValue',
  'GfnRegionDesc',
  'GfnRegionTitle',
  'GfnResolutionDesc',
  'GfnResolutionTitle',
  'GfnResyncLibraryDesc',
  'GfnResyncLibraryFailed',
  'GfnResyncLibraryFailedDetail',
  'GfnResyncLibraryLoading',
  'GfnResyncLibrarySignedOutDesc',
  'GfnResyncLibraryTitle',
  'GfnResyncLibraryUnconfirmed',
  'GfnSettings',
  'GfnSignOutConfirm',
  'GfnSignedIn',
  'If your device supports newer codecs, it can reduce the video bandwidth requirements',
  'InputMapping',
  'Japan1',
  'Japan2',
  'Joystick dead zone',
  'Key mapping',
  'Korea1',
  'Korea2',
  'Loading...',
  'Mapping key of gamepad',
  'Modify controller response rate',
  'Others',
  'Poland',
  'Polling rate',
  'Preferred language of game',
  'Resolution',
  'SectionAccount',
  'SectionRegionSignaling',
  'SectionSignInLanguage',
  'SectionVideo',
  'Set language of AnyStreaming',
  'Set language of cloud game',
  'Set region',
  'Set resolution, support 720P/1080P/1080P(HQ)',
  'Settings',
  'Signal server',
  'South India',
  'Success',
  'The signaling server is a server for stream negotiation. If the host cannot connect, please try modifying this option',
  'TokenCopyFailed',
  'Ultra low latency decoding',
  'UltraLowLatencyDecoderDesc',
  'United States1',
  'United States2',
  'Warning',
  'XboxAccountTitle',
  'XboxGamePassActive',
  'XboxPlaytimeAdFree',
  'XboxPlaytimeAdFreeUnlimited',
  'XboxPlaytimeAdSupported',
  'XboxPlaytimeAdSupportedUnlimited',
  'XboxPlaytimeLoading',
  'XboxPlaytimeNone',
  'XboxPlaytimeTitle',
  'XboxPlaytimeUnavailable',
  'XboxSettings',
  'XcloudAccountSignedInDesc',
  'XcloudAccountSignedOutDesc',
  'XcloudNativeWebRtcDesc',
  'XcloudNativeWebRtcTitle',
  'fsr_sharpness_desc',
  'fsr_sharpness_title',
  'resolutionTips',
];

// A handful of keys are whole English sentences used as their own i18next
// key (the project's own established convention, e.g. 'Do you want to
// logout?') rather than a short identifier -- Android resource names must
// be [a-zA-Z_][a-zA-Z0-9_]*, so those get a readable, deterministic
// sanitized name instead of a mangled one.
function androidResourceName(key) {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    return key;
  }
  let name = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[a-zA-Z_]/.test(name)) {
    name = `_${name}`;
  }
  return name;
}

function extractStringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  // Handles adjacent string-literal concatenation ('a' + 'b' + ...) in case
  // a future entry in these files uses it; no current entry does.
  if (
    node.kind === ts.SyntaxKind.BinaryExpression &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = extractStringValue(node.left);
    const right = extractStringValue(node.right);
    if (left != null && right != null) {
      return left + right;
    }
  }
  return null;
}

function loadTranslations(locale) {
  const filePath = path.join(LANGUAGES_DIR, `${locale}.ts`);
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const result = {};

  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'translation' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) {
          continue;
        }
        const key =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
            ? prop.name.text
            : null;
        if (key == null) {
          continue;
        }
        const value = extractStringValue(prop.initializer);
        if (value != null) {
          result[key] = value;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

// i18next's {{name}} -> Android's %1$s/%2$s/..., assigning each distinct
// placeholder name a position the first time it's seen.
function convertPlaceholders(value, positions) {
  return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, name) => {
    let index = positions.get(name);
    if (index === undefined) {
      index = positions.size + 1;
      positions.set(name, index);
    }
    return `%${index}$s`;
  });
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

// Android treats every string resource as a java.util.Formatter format
// string whenever it's read with format args (getString(id, args...)) --
// which every string this script converts a {{placeholder}} into %n$s for
// will be. A literal '%' in that case must be escaped to '%%', or
// Formatter throws UnknownFormatConversionException at runtime. Must run
// BEFORE convertPlaceholders, since it only escapes '%' characters that
// were already in the source text, not the ones that conversion itself
// produces.
function escapeLiteralPercent(value) {
  return value.replace(/%/g, '%%');
}

function buildXml(locale, translations, keys) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    // XML comments may not contain "--" anywhere in their body (only as the
    // closing "-->"), so this uses plain punctuation throughout, not em/en
    // dashes as a separator the way the rest of this codebase's comments do.
    '<!--',
    '  GENERATED FILE: do not hand-edit.',
    '  Generated by scripts/generate-android-strings.js from',
    `  src/shared/config/languages/${locale}.ts for the Jetpack Compose`,
    '  Settings screen. Re-run that script after editing the source',
    '  translations or the key list it draws from.',
    '-->',
    '<resources>',
  ];
  const usedNames = new Map();
  for (const key of keys) {
    const raw = translations[key];
    if (raw == null) {
      // A hard failure, not a warn-and-skip: nothing currently wires this
      // script into CI, so a silently incomplete resource file (e.g. a key
      // removed from one locale but still in SETTINGS_KEYS) could otherwise
      // ship unnoticed.
      throw new Error(`Missing translation key "${key}" in ${locale}.ts`);
    }
    const name = androidResourceName(key);
    const existingKey = usedNames.get(name);
    if (existingKey !== undefined && existingKey !== key) {
      throw new Error(
        `Resource name collision: "${key}" and "${existingKey}" both sanitize to "${name}". ` +
          'Add an explicit override in androidResourceName().',
      );
    }
    usedNames.set(name, key);
    // English's placeholder-name -> position mapping is reused for every
    // locale, so a caller's positional args line up the same way regardless
    // of which language is active.
    const positions = PLACEHOLDER_POSITIONS.get(key) || new Map();
    PLACEHOLDER_POSITIONS.set(key, positions);
    const percentEscaped = escapeLiteralPercent(raw);
    const converted = convertPlaceholders(percentEscaped, positions);
    const escaped = xmlEscape(converted);
    lines.push(`    <string name="${name}">${escaped}</string>`);
  }
  lines.push('</resources>', '');
  return lines.join('\n');
}

const PLACEHOLDER_POSITIONS = new Map();

function main() {
  const en = loadTranslations('en');
  const ja = loadTranslations('ja');

  // English first, so its placeholder order is the one every other
  // locale's %n$s positions reuse.
  const enXml = buildXml('en', en, SETTINGS_KEYS);
  const jaXml = buildXml('ja', ja, SETTINGS_KEYS);

  const valuesDir = path.join(RES_DIR, 'values');
  const valuesJaDir = path.join(RES_DIR, 'values-ja');
  fs.mkdirSync(valuesDir, {recursive: true});
  fs.mkdirSync(valuesJaDir, {recursive: true});
  fs.writeFileSync(path.join(valuesDir, 'settings_strings.xml'), enXml);
  fs.writeFileSync(path.join(valuesJaDir, 'settings_strings.xml'), jaXml);

  process.stdout.write(
    'Wrote android/app/src/main/res/values/settings_strings.xml and values-ja/settings_strings.xml\n',
  );
}

main();
