#!/usr/bin/env node
/**
 * WCAG 2.1 contrast audit for TeeReady theme tokens.
 * Fails (exit 1) if any text/status color is under 4.5:1 on --canvas or --surface.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8');

const THEMES = ['light', 'dark', 'sand'];
/** Tokens that must read as text/icon color on canvas & surface */
const FG_TOKENS = ['ink', 'muted', 'faint', 'brand', 'accent', 'warn', 'bad'];
const BG_TOKENS = ['canvas', 'surface'];
const MIN_RATIO = 4.5;
const MIN_FOCUS_RATIO = 3;
const FOCUS_BG_TOKENS = ['canvas', 'surface', 'hero'];

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function srgbToLin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLum([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}

function contrast(a, b) {
  const L1 = relLum(a);
  const L2 = relLum(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function parseThemeBlock(theme) {
  const selector =
    theme === 'light'
      ? /(?::root,\s*)?html\[data-theme='light'\]\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s
      : new RegExp(`html\\[data-theme='${theme}'\\]\\s*\\{([^}]+)\\}`, 's');
  // Simpler: find block start and brace-match
  const startRe =
    theme === 'light'
      ? /(?:^|\n)(?::root,\s*)?html\[data-theme='light'\]\s*\{/m
      : new RegExp(`(?:^|\\n)html\\[data-theme='${theme}'\\]\\s*\\{`, 'm');
  const m = CSS.match(startRe);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let body = '';
  while (i < CSS.length && depth > 0) {
    const ch = CSS[i++];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth > 0) body += ch;
  }
  const tokens = {};
  for (const line of body.split('\n')) {
    const tm = line.match(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    if (tm) tokens[tm[1]] = tm[2].toLowerCase();
  }
  return tokens;
}

function main() {
  const failures = [];
  console.log('Contrast audit (WCAG AA normal text ≥ 4.5:1)\n');

  for (const theme of THEMES) {
    const tokens = parseThemeBlock(theme);
    if (!tokens) {
      failures.push(`missing theme block: ${theme}`);
      continue;
    }
    console.log(`── ${theme} ──`);
    for (const fgName of FG_TOKENS) {
      const fgHex = tokens[fgName];
      if (!fgHex) {
        failures.push(`${theme}: missing --${fgName}`);
        continue;
      }
      const fg = hexToRgb(fgHex);
      for (const bgName of BG_TOKENS) {
        const bgHex = tokens[bgName];
        if (!bgHex) {
          failures.push(`${theme}: missing --${bgName}`);
          continue;
        }
        const bg = hexToRgb(bgHex);
        const ratio = contrast(fg, bg);
        const ok = ratio >= MIN_RATIO;
        const mark = ok ? '✓' : '✗';
        console.log(
          `  ${mark} --${fgName} (${fgHex}) on --${bgName} (${bgHex}): ${ratio.toFixed(2)}`,
        );
        if (!ok) {
          failures.push(
            `${theme} --${fgName} on --${bgName}: ${ratio.toFixed(2)} < ${MIN_RATIO}`,
          );
        }
      }
    }
    console.log('');
    const focusHex = tokens['focus-ring'];
    if (!focusHex) {
      failures.push(`${theme}: missing --focus-ring`);
    } else {
      const focus = hexToRgb(focusHex);
      console.log(`── ${theme} focus ring (≥3:1) ──`);
      for (const bgName of FOCUS_BG_TOKENS) {
        const bgHex = tokens[bgName];
        if (!bgHex) continue;
        const bg = hexToRgb(bgHex);
        const ratio = contrast(focus, bg);
        const ok = ratio >= MIN_FOCUS_RATIO;
        const mark = ok ? '✓' : '✗';
        console.log(
          `  ${mark} --focus-ring (${focusHex}) on --${bgName} (${bgHex}): ${ratio.toFixed(2)}`,
        );
        if (!ok) {
          failures.push(
            `${theme} --focus-ring on --${bgName}: ${ratio.toFixed(2)} < ${MIN_FOCUS_RATIO}`,
          );
        }
      }
      console.log('');
    }
  }

  if (failures.length) {
    console.error(`${failures.length} contrast failure(s):`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  console.log('All theme token pairs clear 4.5:1.');
}

main();
