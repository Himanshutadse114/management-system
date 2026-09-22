import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("menu photos are compressed to 100 KB from both upload interfaces", async () => {
  const [compression, menuForm, imageManager] = await Promise.all([
    source("../src/menuImageCompression.js"),
    source("../src/RestaurantManagerWorkspace.jsx"),
    source("../src/MenuImageManager.jsx"),
  ]);

  assert.match(compression, /MENU_IMAGE_MAX_BYTES\s*=\s*100\s*\*\s*1024/);
  assert.match(compression, /result\.size\s*<=\s*maxBytes/);
  assert.match(compression, /type:\s*"image\/jpeg"/);
  assert.match(menuForm, /Menu item photo/);
  assert.match(menuForm, /compressMenuImage\(original\)/);
  assert.match(
    menuForm,
    /body\.append\([\s\S]*?"image",[\s\S]*?menuImageFile,[\s\S]*?menuImageFile\.name/,
  );
  assert.match(imageManager, /const compressed = await compressMenuImage\(file\)/);
  assert.match(
    imageManager,
    /body\.append\('image', compressed, compressed\.name/,
  );
});

test("the Android shell connects web photo inputs to the native picker", async () => {
  const [mobileSource, mobileManifest] = await Promise.all([
    source("../../mobile/lib/main.dart"),
    source("../../mobile/pubspec.yaml"),
  ]);
  assert.match(mobileManifest, /file_picker:\s*\^8\.3\.7/);
  assert.match(mobileSource, /setOnShowFileSelector\(_selectWebFiles\)/);
  assert.match(mobileSource, /FilePicker\.platform\.pickFiles/);
  assert.match(mobileSource, /FileType\.image/);
});

test("the API refuses to store menu photos over 100 KB", async () => {
  const inventoryRoute = await source("../../server/src/routes/inventory.js");
  assert.match(inventoryRoute, /MAX_PRODUCT_IMAGE_BYTES\s*=\s*100\s*\*\s*1024/);
  assert.match(inventoryRoute, /limits:\s*\{\s*fileSize:\s*MAX_PRODUCT_IMAGE_BYTES/);
  assert.match(inventoryRoute, /MENU_IMAGE_TOO_LARGE/);
  assert.match(inventoryRoute, /receiveProductImage/);
});

test("the choose-photo control keeps its icon and text on one aligned row", async () => {
  const css = await source("../src/restaurant.css");
  assert.match(
    css,
    /\.restaurant-form label\.menu-image-choose\s*\{[\s\S]*?display:\s*inline-grid;[\s\S]*?grid-template-columns:\s*16px max-content;[\s\S]*?align-items:\s*center;/,
  );
  assert.match(css, /\.menu-image-choose svg\s*\{[\s\S]*?align-self:\s*center;/);
  assert.match(
    css,
    /\.restaurant-form \.menu-image-choose > span\s*\{[\s\S]*?line-height:\s*1 !important;/,
  );
});
