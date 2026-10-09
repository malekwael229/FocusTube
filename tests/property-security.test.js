"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const fc = require("fast-check");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const FIXED_SEED = 20261009;
const NUM_RUNS = 500;
const configuredSeed = Number(process.env.FC_SEED ?? FIXED_SEED);
const seed = Number.isInteger(configuredSeed) ? configuredSeed : FIXED_SEED;
const replayPath = process.env.FC_PATH;

// Replay a shrunk failure with:
// FC_SEED=20261009 FC_PATH=<path> node --test --test-name-pattern="<property>" tests/property-security.test.js

function propertyOptions() {
  return {
    numRuns: NUM_RUNS,
    seed,
    ...(replayPath ? { path: replayPath } : {}),
  };
}

function assertProperty(name, property) {
  try {
    fc.assert(property, propertyOptions());
  } catch (error) {
    error.message += `\nReplay: FC_SEED=${seed} FC_PATH=${replayPath || "<path from failure>"} `
      + `node --test --test-name-pattern=${JSON.stringify(name)} tests/property-security.test.js`;
    throw error;
  }
}

function evaluateSanitizer(declarationSource) {
  const context = vm.createContext({});
  vm.runInContext(
    `${declarationSource}\n` +
      "globalThis.__sanitizeImportData = sanitizeImportData;\n" +
      "globalThis.__objectPrototype = Object.prototype;",
    context,
    { filename: "options.js (settings sanitizer extraction)" },
  );
  return {
    source: declarationSource,
    sanitize: context.__sanitizeImportData,
    objectPrototype: context.__objectPrototype,
  };
}

function extractSanitizer(source = read("options.js")) {
  const startMarker = "  const defaultSettings = {";
  const endMarker = "  const customSelectParts = new WeakMap();";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `options.js marker missing: ${startMarker}`);
  assert.ok(end > start, `options.js marker missing or reordered: ${endMarker}`);
  return evaluateSanitizer(source.slice(start, end));
}

function extractSite(source = read("content-common.js")) {
  const startMarker = "const Site = {";
  const endMarker = "const CONFIG =";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `content-common.js marker missing: ${startMarker}`);
  assert.ok(end > start, `content-common.js marker missing or reordered: ${endMarker}`);
  const declarationSource = source.slice(start, end);
  const context = vm.createContext({ location: { hostname: "" } });
  vm.runInContext(`${declarationSource}\nglobalThis.__Site = Site;`, context, {
    filename: "content-common.js (Site extraction)",
  });
  return {
    context,
    call(hostname, method) {
      context.location.hostname = hostname;
      return context.__Site[method]();
    },
  };
}

const sanitizer = extractSanitizer();
const site = extractSite();

const booleanKeys = [
  "ft_enabled", "autoStartBreaks", "focusMode", "lockSettings", "showNotifications",
  "darkMode", "popup_visible_yt", "popup_visible_ig", "popup_visible_tt", "popup_visible_fb",
  "popup_visible_li", "popup_visible_rd", "restrictHiddenPlatforms", "visualHideHiddenPlatforms",
  "hide_ig_stories", "hide_fb_stories", "hide_yt_shorts_nav", "hide_yt_shorts_shelves",
  "hide_yt_most_relevant_shelf", "hide_yt_playables", "hide_ig_reels_nav", "hide_ig_suggested",
  "hide_fb_reels_nav", "hide_fb_people_you_might_know", "hide_li_feed", "hide_li_addfeed",
  "hide_li_suggested", "hide_li_activity", "showBreakButton", "tutorialCompleted", "reviewDismissed",
  "ft_work_session_ended", "ft_debug",
];
const stringKeys = ["accentColor", "ft_timer_type"];
const platformKeys = ["yt", "ig", "tt", "fb", "li", "rd"];
const platformModes = ["strict", "warn", "allow"];
const supportedOutputKeys = new Set([
  ...booleanKeys,
  "ft_timer_duration", "breakDuration", "ft_stats_blocked", "ft_timer_end", "reviewLaterTime",
  "reviewNextBlock", ...stringKeys, "platformSettings",
]);

const colorArb = fc.integer({ min: 0, max: 0xffffff }).map(
  (value) => `#${value.toString(16).padStart(6, "0")}`,
);
const safeIntegerArb = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
const numberArbs = {
  ft_timer_duration: fc.constantFrom(15, 25, 30, 45, 60),
  breakDuration: fc.constantFrom(5, 10, 15),
  ft_stats_blocked: fc.integer({ min: 0, max: 100000 }),
  reviewLaterTime: fc.oneof(safeIntegerArb, fc.constant(null)),
  reviewNextBlock: fc.oneof(safeIntegerArb, fc.constant(null)),
};
const scalarArbs = {
  ...Object.fromEntries(booleanKeys.map((key) => [key, fc.boolean()])),
  ...numberArbs,
  accentColor: colorArb,
};

const validPlatformSettingsArb = fc.array(
  fc.tuple(fc.constantFrom(...platformKeys), fc.constantFrom(...platformModes)),
  { minLength: 1, maxLength: platformKeys.length },
).map((entries) => Object.fromEntries(entries));

const validFieldArb = fc.constantFrom(...Object.keys(scalarArbs)).chain((key) =>
  scalarArbs[key].map((value) => ({ [key]: value })),
);
const validTimerPairArb = fc.record({
  end: fc.oneof(safeIntegerArb.filter((value) => value > 0), fc.constant(null)),
  type: fc.constantFrom("work", "break"),
}).map(({ end, type }) => ({ ft_timer_end: end, ft_timer_type: type }));
const validSettingsArb = fc.record({
  fields: fc.array(validFieldArb, { maxLength: 32 }),
  platformSettings: fc.option(validPlatformSettingsArb, { nil: undefined }),
  timerPair: fc.boolean(),
}).chain(({ fields, platformSettings, timerPair }) => {
  const timer = timerPair ? validTimerPairArb : fc.constant({});
  return timer.map((pair) => Object.assign({}, ...fields, platformSettings === undefined
    ? {}
    : { platformSettings }, pair));
});

function invoke(sanitize, raw) {
  try {
    return { threw: false, result: sanitize(raw) };
  } catch (error) {
    // Object values whose coercion hooks throw are rejected by the real import
    // handler's catch boundary, so direct-helper tests allow this outcome.
    return { threw: true, error };
  }
}

function jsonComparable(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoUnexpectedOutputKeys(result) {
  assert.equal(result && typeof result === "object", true);
  if (!result.sanitized) return;
  for (const key of Object.keys(result.sanitized)) {
    assert.equal(supportedOutputKeys.has(key), true, `unexpected output key: ${key}`);
  }
}

function assertOutputTypes(result) {
  if (!result.sanitized) return;
  const numericKeys = new Set([
    "ft_timer_duration", "breakDuration", "ft_stats_blocked", "ft_timer_end",
    "reviewLaterTime", "reviewNextBlock",
  ]);
  for (const [key, value] of Object.entries(result.sanitized)) {
    if (booleanKeys.includes(key)) assert.equal(typeof value, "boolean", key);
    if (numericKeys.has(key) && !(["reviewLaterTime", "reviewNextBlock"].includes(key) && value === null)) {
      assert.equal(typeof value, "number", key);
    }
    if (stringKeys.includes(key)) assert.equal(typeof value, "string", key);
    if (key === "platformSettings") {
      assert.equal(typeof value, "object", key);
      assert.equal(Array.isArray(value), false, key);
      for (const mode of Object.values(value)) assert.equal(platformModes.includes(mode), true, key);
    }
  }
}

test("settings imports preserve allowlisted values and remain idempotent", () => {
  assertProperty(
    "settings imports preserve allowlisted values and remain idempotent",
    fc.property(validSettingsArb, (raw) => {
      const before = structuredClone(raw);
      const first = invoke(sanitizer.sanitize, raw);
      assert.equal(first.threw, false);
      assert.ok(first.result && first.result.sanitized);
      const expected = structuredClone(raw);
      if (expected.ft_timer_end === null) {
        delete expected.ft_timer_end;
        delete expected.ft_timer_type;
      }
      assert.deepEqual(jsonComparable(first.result.sanitized), expected);
      assert.deepEqual(raw, before, "sanitization must not mutate its input");
      assertNoUnexpectedOutputKeys(first.result);
      assertOutputTypes(first.result);

      const second = invoke(sanitizer.sanitize, first.result.sanitized);
      assert.equal(second.threw, false);
      assert.deepEqual(
        jsonComparable(second.result),
        jsonComparable(first.result),
        "accepted results should sanitize identically",
      );
    }),
  );
});

test("settings imports reject unsupported durations", () => {
  const invalidDuration = fc.integer({ min: -1000, max: 1000 }).filter(
    (value) => ![5, 10, 15, 25, 30, 45, 60].includes(value),
  );
  assertProperty(
    "settings imports reject unsupported durations",
    fc.property(
      fc.record({
        key: fc.constantFrom("ft_timer_duration", "breakDuration"),
        value: fc.oneof(
          invalidDuration,
          fc.constantFrom("n/a", "NaN", "", false, [], {}),
        ),
      }),
      ({ key, value }) => {
        const outcome = invoke(sanitizer.sanitize, { [key]: value });
        assert.equal(outcome.threw, false);
        assert.equal(outcome.result.errorKey, "importInvalidValues");
      },
    ),
  );
});

test("settings imports reject invalid platform modes", () => {
  const invalidMode = fc.string({ maxLength: 20 }).filter((value) => !platformModes.includes(value));
  assertProperty(
    "settings imports reject invalid platform modes",
    fc.property(
      fc.record({ platform: fc.constantFrom(...platformKeys), mode: invalidMode }),
      ({ platform, mode }) => {
        const outcome = invoke(sanitizer.sanitize, { platformSettings: { [platform]: mode } });
        assert.equal(outcome.threw, false);
        assert.equal(outcome.result.errorKey, "importInvalidValues");
      },
    ),
  );
});

test("settings imports reject incomplete timer pairs", () => {
  const incompletePair = fc.oneof(
    fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }).map((end) => ({ ft_timer_end: end })),
    fc.constantFrom("work", "break").map((type) => ({ ft_timer_type: type })),
  );
  assertProperty(
    "settings imports reject incomplete timer pairs",
    fc.property(incompletePair, (raw) => {
      const outcome = invoke(sanitizer.sanitize, raw);
      assert.equal(outcome.threw, false);
      assert.equal(outcome.result.errorKey, "importTimerFieldsTogether");
    }),
  );

});

test("settings imports reject invalid complete timer pairs", () => {
  const invalidEnd = fc.oneof(
    fc.integer({ min: -100, max: 0 }),
    fc.constantFrom("not-a-time", "", false, [], {}),
  );
  const invalidType = fc.string({ maxLength: 20 }).filter((value) => !["work", "break"].includes(value));
  assertProperty(
    "settings imports reject invalid complete timer pairs",
    fc.property(
      fc.oneof(
        invalidEnd.map((end) => ({ ft_timer_end: end, ft_timer_type: "work" })),
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }).chain((end) =>
          invalidType.map((type) => ({ ft_timer_end: end, ft_timer_type: type }))),
      ),
      (raw) => {
        const outcome = invoke(sanitizer.sanitize, raw);
        assert.equal(outcome.threw, false);
        assert.equal(outcome.result.errorKey, "importInvalidValues");
      },
    ),
  );
});

test("unknown and prototype-looking import keys cannot pollute sanitized output", () => {
  const unknownKey = fc.constantFrom("unknownSetting", "constructor", "prototype", "__proto__");
  assertProperty(
    "unknown and prototype-looking import keys cannot pollute sanitized output",
    fc.property(validSettingsArb, unknownKey, fc.jsonValue(), (base, key, value) => {
      const raw = structuredClone(base);
      Object.defineProperty(raw, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
      const before = structuredClone(raw);
      const outcome = invoke(sanitizer.sanitize, raw);
      assert.equal(outcome.threw, false);
      assertNoUnexpectedOutputKeys(outcome.result);
      assert.deepEqual(raw, before, "sanitization must not mutate unknown input fields");
      assert.equal(Object.getPrototypeOf(outcome.result.sanitized), sanitizer.objectPrototype);
      assert.equal(Object.prototype.hasOwnProperty.call(outcome.result.sanitized, key), false);
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal(sanitizer.objectPrototype.polluted, undefined);
    }),
  );

  const explicit = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},'
      + '"prototype":{"polluted":true},"ft_enabled":true}',
  );
  const result = sanitizer.sanitize(explicit);
  assert.deepEqual(jsonComparable(result), { sanitized: { ft_enabled: true } });
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(sanitizer.objectPrototype.polluted, undefined);
});

const inputKeys = [
  ...booleanKeys,
  "ft_timer_duration", "breakDuration", "ft_stats_blocked", "ft_timer_end",
  "reviewLaterTime", "reviewNextBlock", ...stringKeys, "platformSettings",
];
const arbitraryImportObjectArb = fc.record({
  known: fc.array(fc.tuple(fc.constantFrom(...inputKeys), fc.jsonValue()), { maxLength: 12 }),
  random: fc.array(fc.tuple(fc.string({ maxLength: 16 }), fc.jsonValue()), { maxLength: 12 }),
}).map(({ known, random }) => {
  const raw = {};
  for (const [key, value] of [...known, ...random]) {
    Object.defineProperty(raw, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
  return raw;
});
const hostileNumericKeys = [
  "ft_timer_duration", "breakDuration", "ft_stats_blocked", "ft_timer_end", "reviewLaterTime",
];
const hostileCoercionArb = fc.constantFrom(...hostileNumericKeys).map((key) => {
  const raw = {};
  Object.defineProperty(raw, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: Object.create(null),
  });
  return raw;
});

function isExpectedNumericCoercion(raw, error) {
  if (error?.name !== "TypeError" || error.message !== "Cannot convert object to primitive value") {
    return false;
  }
  return hostileNumericKeys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(raw, key) || raw[key] === null) return false;
    try {
      Number(raw[key]);
      return false;
    } catch (coercionError) {
      return coercionError?.name === "TypeError"
        && coercionError.message === "Cannot convert object to primitive value";
    }
  });
}

test("sanitizer rejects noncoercible numeric values", () => {
  const hostileCorpus = [
    ...hostileNumericKeys.map((key) => ({ [key]: Object.create(null) })),
    { ft_stats_blocked: [{ toString: null }] },
    { ft_stats_blocked: [{ toString: null }], reviewNextBlock: 123 },
  ];
  for (const raw of hostileCorpus) {
    const key = Object.keys(raw).find((candidate) => hostileNumericKeys.includes(candidate));
    const outcome = invoke(sanitizer.sanitize, raw);
    assert.equal(outcome.threw, true);
    assert.equal(isExpectedNumericCoercion(raw, outcome.error), true, key);
  }
});

test("arbitrary JSON imports stay within the sanitizer boundary", () => {
  assertProperty(
    "arbitrary JSON imports stay within the sanitizer boundary",
    fc.property(fc.oneof(fc.jsonValue(), arbitraryImportObjectArb, hostileCoercionArb), (raw) => {
      const before = jsonComparable(raw);
      const outcome = invoke(sanitizer.sanitize, raw);
      assert.deepEqual(jsonComparable(raw), before, "arbitrary input must not be mutated");
      if (outcome.threw) {
        assert.equal(
          isExpectedNumericCoercion(raw, outcome.error),
          true,
          `unexpected sanitizer exception: ${outcome.error?.message}`,
        );
        return;
      }

      if (!outcome.result.sanitized) {
        assert.equal(
          ["importObjectRequired", "importInvalidValues", "importTimerFieldsTogether"]
            .includes(outcome.result.errorKey),
          true,
          `unexpected sanitizer error: ${outcome.result.errorKey}`,
        );
        return;
      }
      assert.equal(Object.getPrototypeOf(outcome.result.sanitized), sanitizer.objectPrototype);
      assertNoUnexpectedOutputKeys(outcome.result);
      assertOutputTypes(outcome.result);
      const replay = invoke(sanitizer.sanitize, jsonComparable(outcome.result.sanitized));
      assert.equal(replay.threw, false, "accepted output must be safely re-importable");
      assert.deepEqual(jsonComparable(replay.result), jsonComparable(outcome.result));
    }),
  );
});

test("edge corpus preserves numeric coercion while enforcing reviewNextBlock safe integers", () => {
  const cases = [
    [{ ft_timer_duration: "25" }, { ft_timer_duration: 25 }],
    [{ breakDuration: "10" }, { breakDuration: 10 }],
    [{ ft_stats_blocked: "4.9" }, { ft_stats_blocked: 4 }],
    [{ reviewLaterTime: null }, { reviewLaterTime: null }],
    [{ reviewNextBlock: null }, { reviewNextBlock: null }],
    [{ ft_timer_end: null, ft_timer_type: "break" }, {}],
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(jsonComparable(sanitizer.sanitize(raw)), { sanitized: expected });
  }
  assert.deepEqual(
    sanitizer.sanitize({ reviewNextBlock: "123" }).errorKey,
    "importInvalidValues",
  );
  assert.deepEqual(
    sanitizer.sanitize({ reviewNextBlock: 1.5 }).errorKey,
    "importInvalidValues",
  );
});

test("the reviewNextBlock property catches an in-memory unsafe-integer mutant", () => {
  const mutantSource = sanitizer.source.replace(
    "!Number.isSafeInteger(raw[key])",
    "false",
  );
  assert.notEqual(mutantSource, sanitizer.source, "mutation target must remain present");
  const mutant = evaluateSanitizer(mutantSource);
  const invalidReviewNextBlock = fc.oneof(
    fc.constant(1.5),
    fc.double({ min: 0, max: Number.MAX_SAFE_INTEGER, noNaN: true, noDefaultInfinity: true })
      .filter((value) => !Number.isSafeInteger(value)),
  );
  const rejectsUnsafeInteger = (sanitize) => fc.property(
    invalidReviewNextBlock,
    (value) => {
      const outcome = invoke(sanitize, { reviewNextBlock: value });
      assert.equal(outcome.threw, false);
      assert.equal(outcome.result.errorKey, "importInvalidValues");
    },
  );
  const productionRun = fc.check(rejectsUnsafeInteger(sanitizer.sanitize), propertyOptions());
  assert.equal(productionRun.failed, false, productionRun.error?.message);
  const mutantRun = fc.check(rejectsUnsafeInteger(mutant.sanitize), propertyOptions());
  assert.equal(mutantRun.failed, true, "the property must fail against the in-memory mutant");
});

const siteCases = [
  ["isYT", "youtube.com"],
  ["isIG", "instagram.com"],
  ["isTT", "tiktok.com"],
  ["isFB", "facebook.com"],
  ["isLI", "linkedin.com"],
];
const hostnameLabel = fc.constantFrom("a", "video", "nested", "sub", "x9");
const port = fc.integer({ min: 1, max: 65535 });
const credentials = fc.constantFrom("", "user:pass@", "viewer:@");

function hostnameFromUrl(host, portNumber, auth) {
  return new URL(`https://${auth}${host}:${portNumber}/watch?v=1`).hostname;
}

test("Site helpers accept canonical supported subdomains with credentials and ports", () => {
  assertProperty(
    "Site helpers accept canonical supported subdomains with credentials and ports",
    fc.property(
      fc.constantFrom(...siteCases),
      fc.array(hostnameLabel, { maxLength: 4 }),
      credentials,
      port,
      ([method, domain], labels, auth, portNumber) => {
        const host = [...labels, domain].join(".");
        const hostname = hostnameFromUrl(host, portNumber, auth);
        assert.equal(site.call(hostname, method), true);
      },
    ),
  );
});

test("Site helpers reject suffix impersonation", () => {
  assertProperty(
    "Site helpers reject suffix impersonation",
    fc.property(
      fc.constantFrom(...siteCases),
      hostnameLabel,
      credentials,
      port,
      ([method, domain], label, auth, portNumber) => {
        const hostname = hostnameFromUrl(`${domain}.evil.example`, portNumber, auth);
        assert.equal(site.call(hostname, method), false);
        assert.equal(
          site.call(hostnameFromUrl(`not${domain}`, portNumber, auth), method),
          false,
        );
        assert.equal(
          site.call(hostnameFromUrl(`${label}.${domain}.evil.example`, portNumber, auth), method),
          false,
        );
      },
    ),
  );
});

test("Reddit helpers accept only apex and www hosts", () => {
  const redditApex = fc.constantFrom("reddit.com", "www.reddit.com");
  assertProperty(
    "Reddit helpers accept only apex and www hosts",
    fc.property(redditApex, credentials, port, (host, auth, portNumber) => {
      assert.equal(site.call(hostnameFromUrl(host, portNumber, auth), "isRD"), true);
    }),
  );
  for (const host of ["old.reddit.com", "reddit.com.evil.example", "www.reddit.com.evil.example", "redd.it"]) {
    assert.equal(site.call(new URL(`https://user:pass@${host}:443/`).hostname, "isRD"), false);
  }
});
