"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matrixStatus, redact } = require("./report");

test("an absent or entirely blocked site never passes", () => {
  assert.equal(matrixStatus([]), "BLOCKED");
  assert.equal(matrixStatus([{ status: "BLOCKED" }]), "BLOCKED");
});
test("a partial pass is not full matrix completion", () => {
  assert.equal(matrixStatus([{ status: "PASS" }, { status: "BLOCKED" }]), "PARTIAL");
  assert.equal(matrixStatus([{ status: "PASS" }]), "PASS");
});
test("failures are never erased by other passing checks", () => {
  assert.equal(matrixStatus([{ status: "PASS" }, { status: "FAIL" }, { status: "BLOCKED" }]), "FAIL");
});
test("diagnostics redact query tokens, email addresses and authorization values", () => {
  const result = redact("https://example.com/path?token=secret#private person@example.com token=secret");
  assert.ok(!result.includes("secret"));
  assert.ok(!result.includes("person@example.com"));
  assert.ok(result.includes("https://example.com/path"));
});
