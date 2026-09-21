import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const srcUrl = new URL("../src/", import.meta.url);

test("refresh controls guarantee visible progress feedback", async () => {
  const [component, css, reports, ecosystem] = await Promise.all([
    readFile(new URL("RefreshButton.jsx", srcUrl), "utf8"),
    readFile(new URL("refresh-button.css", srcUrl), "utf8"),
    readFile(new URL("ReportsWorkspace.jsx", srcUrl), "utf8"),
    readFile(new URL("EcosystemWorkspace.jsx", srcUrl), "utf8"),
  ]);

  assert.match(component, /MINIMUM_FEEDBACK_MS = 700/);
  assert.match(component, /aria-busy=\{refreshing\}/);
  assert.match(component, /refreshing \? refreshingLabel : label/);
  assert.match(css, /\.deva-refresh-button\.is-refreshing \.deva-refresh-icon/);
  assert.match(css, /animation:[^;]+infinite !important/);
  assert.match(reports, /<RefreshButton onRefresh=\{loadHistory\}/);
  assert.match(ecosystem, /<RefreshButton[\s\S]*?onRefresh=\{load\}[\s\S]*?busy=\{loading\}/);
});

test("mobile selects and binary controls use compact application UI", async () => {
  const [overlay, css, typography, main] = await Promise.all([
    readFile(new URL("MobileSelectOverlay.jsx", srcUrl), "utf8"),
    readFile(new URL("mobile-select.css", srcUrl), "utf8"),
    readFile(new URL("deva-typography.css", srcUrl), "utf8"),
    readFile(new URL("main.jsx", srcUrl), "utf8"),
  ]);

  assert.match(main, /<MobileSelectOverlay \/>/);
  assert.match(overlay, /event\.preventDefault\(\)/);
  assert.match(overlay, /new Event\("change", \{ bubbles: true \}\)/);
  assert.match(overlay, /role="radiogroup"/);
  assert.match(css, /input\[type="checkbox"\],[\s\S]*?width:\s*18px !important/);
  assert.match(css, /\.mobile-select-options button[\s\S]*?min-height:\s*50px/);
  assert.match(typography, /input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
});
