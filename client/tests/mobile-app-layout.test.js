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

test("restaurant destinations use a complete mobile navigation grid", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.restaurant-page > \.workspace-tabs\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(css, /white-space:\s*normal !important/);
});

test("role navigation opens as a native left drawer", async () => {
  const css = await readFile(cssUrl, "utf8");
  const shell = await readFile(
    new URL("../src/FocusedWorkspaceShell.jsx", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.focused-mobile-drawer\s*\{/);
  assert.match(css, /inset:\s*0 auto 0 0 !important/);
  assert.match(css, /right:\s*auto !important/);
  assert.match(css, /mobileDrawerFromLeft/);
  assert.match(css, /\.focused-drawer-head\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.focused-mobile-drawer \.focused-drawer-head \.focused-brand\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) !important/);
  assert.match(css, /justify-content:\s*start !important/);
  assert.match(css, /\.focused-mobile-drawer \.focused-brand small\s*\{/);
  assert.match(css, /max-width:\s*none !important/);
  assert.match(css, /white-space:\s*normal !important/);
  assert.match(shell, /focused-drawer-identity/);
  assert.match(shell, /<Brand showRole=\{false\} \/>/);
  assert.match(shell, /<small>\{profile\.primaryRoleLabel\}<\/small>/);
});

test("restaurant exposes the customer menu journey and resets app scrolling", async () => {
  const workspace = await readFile(
    new URL("../src/RestaurantManagerWorkspace.jsx", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("../src/FocusedWorkspaceShell.jsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /Customer menu preview/);
  assert.match(workspace, /Open customer menu/);
  assert.match(workspace, /Create table QR/);
  assert.match(workspace, /No customer QR yet/);
  assert.match(workspace, /scrollHost\.scrollTo\(\{ top: 0/);
  assert.match(shell, /mainRef\.current\?\.scrollTo\(\{ top: 0/);
});

test("table QR creation has bounded geometry and visible interaction feedback", async () => {
  const css = await readFile(cssUrl, "utf8");
  const workspace = await readFile(
    new URL("../src/RestaurantManagerWorkspace.jsx", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.restaurant-form > \.restaurant-submit\s*\{/);
  assert.match(css, /width:\s*calc\(100% - 28px\) !important/);
  assert.match(workspace, /nextTableForm/);
  assert.match(workspace, /Creating table\.\.\./);
  assert.match(workspace, /restaurant-form-message error/);
  assert.match(workspace, /Its customer QR is ready below/);
});

test("mobile forms and cards cannot exceed the application viewport", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(css, /\.growth-card,[\s\S]*min-width:\s*0 !important/);
  assert.match(css, /max-width:\s*100% !important/);
});
