import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const srcUrl = new URL("../src/", import.meta.url);

test("ecosystem controls and delivery history adapt to narrow phones", async () => {
  const [css, workspace] = await Promise.all([
    readFile(new URL("ecosystem.css", srcUrl), "utf8"),
    readFile(new URL("EcosystemWorkspace.jsx", srcUrl), "utf8"),
  ]);

  assert.match(workspace, /scorm-button-secondary eco-refresh/);
  assert.match(workspace, /className="eco-delivery-row"/);
  assert.match(workspace, /data-label="Event"/);
  assert.match(workspace, /data-label="Last error"/);
  assert.match(css, /\.eco-refresh\.scorm-button-secondary\s*\{[\s\S]*?width:\s*auto !important/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.eco-table \.head\s*\{\s*display:\s*none/);
  assert.match(css, /\.eco-table \.eco-delivery-row[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /min-width:\s*650px/);
});

test("the application uses one brand typeface across modules", async () => {
  const files = (await readdir(srcUrl)).filter((name) => name.endsWith(".css"));
  const sources = await Promise.all(
    files.map((name) => readFile(new URL(name, srcUrl), "utf8")),
  );
  const combined = sources.join("\n");
  const tokens = await readFile(new URL("design-tokens.css", srcUrl), "utf8");
  const typography = await readFile(
    new URL("deva-typography.css", srcUrl),
    "utf8",
  );

  assert.match(tokens, /--deva-font-family:\s*'Lora'/);
  assert.match(tokens, /--deva-font-ui:\s*var\(--deva-font-family\)/);
  assert.match(tokens, /--deva-font-display:\s*var\(--deva-font-family\)/);
  assert.match(typography, /#root \*,[\s\S]*?font-family:\s*var\(--deva-font-family\) !important/);
  assert.doesNotMatch(combined, /Ubuntu|Montserrat/i);
});
