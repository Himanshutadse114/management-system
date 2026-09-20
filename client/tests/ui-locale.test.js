import assert from "node:assert/strict";
import test from "node:test";
import { translateInterfaceText } from "../src/uiLocale.js";

test("reviewed navigation and role labels are fully localised", () => {
  assert.equal(translateInterfaceText("hi", "Branch Manager"), "शाखा प्रबंधक");
  assert.equal(translateInterfaceText("mr", "Branch Manager"), "शाखा व्यवस्थापक");
  assert.equal(translateInterfaceText("hi", "Owner Control"), "मालिक नियंत्रण");
  assert.equal(translateInterfaceText("mr", "Sales & Profit"), "विक्री आणि नफा");
});

test("uncommon interface copy does not fall back to Latin-only English", () => {
  const translated = translateInterfaceText("hi", "Approve vendor reconciliation");
  assert.doesNotMatch(translated, /Approve|vendor|reconciliation/i);
  assert.match(translated, /अनुमोदित करें/);
});

test("localisation preserves operational identifiers", () => {
  assert.equal(translateInterfaceText("hi", "manager@example.com"), "manager@example.com");
  assert.match(translateInterfaceText("hi", "Open QR payment"), /QR/);
  assert.match(translateInterfaceText("hi", "Open QR payment"), /भुगतान/);
});

test("English remains the source interface", () => {
  assert.equal(translateInterfaceText("en", "Branch Manager"), "Branch Manager");
});
