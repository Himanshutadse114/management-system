import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../src/mobile-app.css", import.meta.url);

test("phone shell reserves a separate row for bottom navigation", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /grid-template-rows:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.scorm-mobile-tabbar,[\s\S]*position:\s*relative !important/);
  assert.match(css, /\.focused-mobile-tabs[\s\S]*position:\s*relative !important/);
});

test("workspace tabs keep their labels and scroll instead of overlapping", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.workspace-tabs button,[\s\S]*flex:\s*0 0 auto !important/);
  assert.match(css, /white-space:\s*nowrap !important/);
  assert.match(css, /overflow-x:\s*auto !important/);
});

test("mobile forms and cards cannot exceed the application viewport", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(css, /\.growth-card,[\s\S]*min-width:\s*0 !important/);
  assert.match(css, /max-width:\s*100% !important/);
});
