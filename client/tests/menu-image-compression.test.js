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
  assert.match(menuForm, /body\.append\("image", menuImageFile\)/);
  assert.match(imageManager, /const compressed = await compressMenuImage\(file\)/);
  assert.match(imageManager, /body\.append\('image', compressed\)/);
});

test("the API refuses to store menu photos over 100 KB", async () => {
  const inventoryRoute = await source("../../server/src/routes/inventory.js");
  assert.match(inventoryRoute, /MAX_PRODUCT_IMAGE_BYTES\s*=\s*100\s*\*\s*1024/);
  assert.match(inventoryRoute, /limits:\s*\{\s*fileSize:\s*MAX_PRODUCT_IMAGE_BYTES/);
  assert.match(inventoryRoute, /MENU_IMAGE_TOO_LARGE/);
  assert.match(inventoryRoute, /receiveProductImage/);
});
