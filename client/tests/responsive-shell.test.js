import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('mobile theme toggle hides only its label and keeps the switch knob', async () => {
  const css = await source('../src/simple-ui.css');
  assert.match(css, /\.scorm-theme-toggle\s*>\s*span:not\(\.theme-toggle-track\)/);
  assert.match(css, /\.scorm-theme-toggle \.theme-toggle-knob\s*\{\s*display:\s*block\s*!important/);
  assert.doesNotMatch(css, /\.scorm-theme-toggle span:not\(\.theme-toggle-track\)/);
});

test('desktop mode keeps the admin sidebar visible when its column is reserved', async () => {
  const css = await source('../src/shell-layout-final.css');
  assert.match(css, /@media \(min-width:\s*821px\) and \(max-width:\s*1023px\)/);
  assert.match(css, /\.scorm-sidebar\s*\{\s*display:\s*flex\s*!important/);
  assert.match(css, /\.scorm-mobile-tabbar\s*\{\s*display:\s*none\s*!important/);
});

test('primary navigation uses solid current-color glyphs in both shells', async () => {
  const [icons, admin, focused] = await Promise.all([
    source('../src/FilledNavIcon.jsx'),
    source('../src/App.jsx'),
    source('../src/FocusedWorkspaceShell.jsx'),
  ]);
  assert.match(icons, /fill="currentColor"/);
  assert.match(icons, /home:\s*<path/);
  assert.match(icons, /stock:\s*\(/);
  assert.match(icons, /restaurant:\s*\(/);
  assert.match(admin, /<FilledNavIcon name=\{NAV_GLYPHS\[label\]\}/);
  assert.match(focused, /<FilledNavIcon name=\{MODULE_ICONS\[module\]\}/);
});
