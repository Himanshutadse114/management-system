import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('generated files use the Android download bridge with browser fallback', async () => {
  const [helper, reports, operations] = await Promise.all([
    source('../src/download.js'),
    source('../src/ReportsWorkspace.jsx'),
    source('../src/OperationsWorkspace.jsx'),
  ]);
  assert.match(helper, /window\.DevaDownload\?\.postMessage/);
  assert.match(helper, /URL\.createObjectURL/);
  assert.match(reports, /downloadBlob\(response\.data/);
  assert.match(operations, /downloadBlob\(response\.data/);
});

test('business dialogs remain inside short and narrow viewports', async () => {
  const css = await source('../src/styles.css');
  assert.match(css, /\.tenant-delete-modal[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.tenant-delete-card[^}]*max-height:\s*calc\(100dvh/);
  assert.match(css, /\.tenant-delete-card[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.tenant-delete-actions[^}]*flex-wrap:\s*wrap/);
});
