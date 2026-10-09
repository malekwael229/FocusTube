const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const test = require("node:test");

// Resolve the dependencies actually used by Firefox tooling, rather than a
// separate top-level installation that could leave web-ext's copy vulnerable.
const webExtRequire = createRequire(require.resolve("web-ext"));
const fxRunnerRequire = createRequire(webExtRequire.resolve("fx-runner"));
const linterRequire = createRequire(webExtRequire.resolve("addons-linter"));
const cssTreeRequire = createRequire(linterRequire.resolve("css-tree"));
const { quote, parse } = fxRunnerRequire("shell-quote");
const { SourceMapConsumer } = cssTreeRequire("source-map-js");

test("Firefox tooling rejects line terminators after shell comment tokens", () => {
  for (const terminator of ["\n", "\r", "\u2028", "\u2029"]) {
    assert.throws(
      () => quote(["echo", "ok", { comment: "comment" }, `a${terminator}id;#`]),
      TypeError,
    );
  }
  // No shell is executed by these tests.
  assert.deepEqual(parse(quote(["firefox", "-profile", "profile with spaces"])),
    ["firefox", "-profile", "profile with spaces"]);
});

test("Firefox lint tooling rejects malicious indexed source-map offsets", () => {
  const leaf = {
    version: 3, sources: ["input.js"], sourcesContent: ["x"],
    names: [], mappings: "AAAA",
  };
  const indexed = (line, map = leaf) => ({
    version: 3,
    sections: [{ offset: { line, column: 0 }, map }],
  });
  // Constructing a consumer must reject the map before expansion can allocate
  // or iterate through an attacker-controlled number of generated lines.
  for (const line of [1e12, -1, 0.5, "1", null]) {
    assert.throws(() => new SourceMapConsumer(indexed(line)), Error);
  }
  assert.throws(() => new SourceMapConsumer(indexed(5e6, indexed(5e6, indexed(5e6)))), Error);

  const consumer = new SourceMapConsumer(indexed(2));
  const mappings = [];
  consumer.eachMapping((mapping) => mappings.push({
    source: mapping.source, generatedLine: mapping.generatedLine,
  }));
  assert.deepEqual(mappings, [{ source: "input.js", generatedLine: 3 }]);
});
