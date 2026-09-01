"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matrixStatus, redact } = require("./report");
const { parseListeningPort } = require("./firefox-driver");

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
  assert.equal(result, "https://example.com/path [email] token=[redacted]");
});
test("Firefox driver accepts only a loopback port reported by geckodriver", () => {
  assert.equal(
    parseListeningPort("123 geckodriver INFO Listening on 127.0.0.1:55056\n"),
    55056,
  );
  assert.equal(parseListeningPort("Listening on 0.0.0.0:55056"), null);
  assert.equal(parseListeningPort("Listening on 127.0.0.1:70000"), null);
});
