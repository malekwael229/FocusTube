const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));

function makeChrome(initial = {}, options = {}) {
  const state = options.state || { ...initial };
  const storageListeners = [];
  const pendingStorageEvents = [];
  const alarmListeners = [];
  const calls = {
    alarms: [],
    notifications: [],
    runtimeMessages: [],
    tabMessages: [],
    sets: [],
    removes: [],
    gets: [],
    order: [],
  };
  const tabs = options.tabs || [{ id: 11, url: "https://www.youtube.com/" }];
  const runtimeListeners = [];
  const activeAlarms = new Map();
  const finishStorageCallback = (callback, result, failed) => {
    chrome.runtime.lastError = failed ? { message: "storage failure" } : null;
    callback(result);
    chrome.runtime.lastError = null;
  };
  const chrome = {
    runtime: {
      id: "test-extension",
      lastError: null,
      getURL: options.getURL || ((file) => `chrome-extension://test-extension/${file}`),
      onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
      onStartup: { addListener: (listener) => runtimeListeners.push({ startup: listener }) },
      sendMessage(message, callback = () => {}) {
        calls.runtimeMessages.push({ ...message });
        callback();
      },
    },
    storage: {
      onChanged: { addListener: (listener) => storageListeners.push(listener) },
      local: {
        get(keys, callback) {
          calls.gets.push(keys);
          calls.order.push({ action: "get", keys });
          const result = keys === null
            ? { ...state }
            : {};
          if (keys !== null) {
            for (const key of Array.isArray(keys) ? keys : [keys]) result[key] = state[key];
          }
          if (options.onGet) options.onGet(keys, { state, calls, result, activeAlarms });
          const failed = options.getError
            ? options.getError(keys)
            : Boolean(options.getErrors && options.getErrors.shift());
          const finish = () => finishStorageCallback(callback, result, failed);
          if (options.deferGets) options.deferGets.push(finish);
          else finish();
        },
        set(values, callback = () => {}) {
          calls.sets.push({ ...values });
          calls.order.push({ action: "set", values: { ...values } });
          if (options.failSet || (options.failSets && options.failSets-- > 0)) {
            finishStorageCallback(callback, undefined, true);
            return;
          }
          const changes = {};
          for (const [key, newValue] of Object.entries(values)) {
            if (state[key] === newValue) continue;
            changes[key] = { oldValue: state[key], newValue };
            state[key] = newValue;
          }
          callback();
          if (Object.keys(changes).length > 0) {
            pendingStorageEvents.push(() => {
              storageListeners.forEach((listener) => listener(changes, "local"));
            });
          }
        },
        remove(keys, callback = () => {}) {
          const names = Array.isArray(keys) ? keys : [keys];
          calls.removes.push([...names]);
          calls.order.push({ action: "remove", keys: [...names] });
          if (options.failRemove || (options.failRemoves && options.failRemoves-- > 0)) {
            finishStorageCallback(callback, undefined, true);
            return;
          }
          const changes = {};
          for (const key of names) {
            changes[key] = { oldValue: state[key], newValue: undefined };
            delete state[key];
          }
          const finish = () => callback();
          if (options.deferRemoves) options.deferRemoves.push(finish);
          else finish();
          storageListeners.forEach((listener) => listener(changes, "local"));
        },
      },
    },
    alarms: {
      clear(name, callback = () => {}) {
        calls.alarms.push({ action: "clear", name });
        calls.order.push({ action: "alarm-clear", name });
        if (options.failAlarmClear) {
          chrome.runtime.lastError = { message: "alarm clear failure" };
          callback(false);
          chrome.runtime.lastError = null;
          return;
        }
        activeAlarms.delete(name);
        callback(true);
      },
      create(name, info, callback = () => {}) {
        calls.alarms.push({ action: "create", name, info: { ...info } });
        calls.order.push({ action: "alarm-create", name, info: { ...info } });
        if (options.failAlarmCreate || (options.failAlarmCreates && options.failAlarmCreates-- > 0)) {
          chrome.runtime.lastError = { message: "alarm create failure" };
          callback();
          chrome.runtime.lastError = null;
          return;
        }
        activeAlarms.set(name, { ...info });
        callback();
      },
      get(name, callback = () => {}) {
        const failed = options.getAlarmError
          ? options.getAlarmError(name)
          : Boolean(options.getAlarmErrors && options.getAlarmErrors.shift());
        chrome.runtime.lastError = failed ? { message: "alarm lookup failure" } : null;
        const alarm = activeAlarms.get(name);
        const finish = () => callback(alarm ? { ...alarm, scheduledTime: alarm.when } : null);
        if (options.deferAlarmGets) options.deferAlarmGets.push(finish);
        else finish();
        chrome.runtime.lastError = null;
      },
      onAlarm: { addListener: (listener) => alarmListeners.push(listener) },
    },
    notifications: {
      create(id, info, callback = () => {}) {
        calls.notifications.push({ id, info: { ...info } });
        callback();
      },
    },
    tabs: {
      query(_query, callback) {
        if (options.failTabsQuery) {
          chrome.runtime.lastError = { message: "tabs query failure" };
          chrome.runtime.lastError = null;
          callback(undefined);
          return;
        }
        callback(tabs);
      },
      sendMessage(tabId, message, callback = () => {}) {
        calls.tabMessages.push({ tabId, message: { ...message } });
        callback();
      },
    },
  };
  return {
    chrome,
    state,
    calls,
    activeAlarms,
    listenerCounts() {
      return {
        runtime: runtimeListeners.filter((listener) => typeof listener === "function").length,
        alarms: alarmListeners.length,
      };
    },
    fireStartup() {
      runtimeListeners
        .filter((listener) => listener && listener.startup)
        .forEach((listener) => listener.startup());
    },
    fireAlarm(alarm) { alarmListeners.forEach((listener) => listener(alarm)); },
    fireStorage(changes, area = "local") { storageListeners.forEach((listener) => listener(changes, area)); },
    flushStorageEvents() { while (pendingStorageEvents.length) pendingStorageEvents.shift()(); },
    flushAlarmGets() {
      while (options.deferAlarmGets && options.deferAlarmGets.length) options.deferAlarmGets.shift()();
    },
    externalStorage(values) {
      const changes = {};
      for (const [key, newValue] of Object.entries(values)) {
        changes[key] = { oldValue: state[key], newValue };
        if (newValue === undefined) delete state[key];
        else state[key] = newValue;
      }
      storageListeners.forEach((listener) => listener(changes, "local"));
    },
    sendRuntimeMessage(request, sender = {}) {
      const responses = [];
      runtimeListeners
        .filter((listener) => typeof listener === "function")
        .forEach((listener) => listener(request, sender, (response) => responses.push(response)));
      return responses;
    },
    setNow(now) { options.now = now; },
    setAlarmCreateFailure(failed) { options.failAlarmCreate = failed; },
    setAlarmCreateFailures(count) { options.failAlarmCreates = count; },
    setAlarmClearFailure(failed) { options.failAlarmClear = failed; },
    setRemoveFailure(failed) { options.failRemove = failed; },
  };
}

function loadBackground(initial, options) {
  const runtimeOptions = options || {};
  const fake = makeChrome(initial, runtimeOptions);
  const context = {
    chrome: fake.chrome,
    console: runtimeOptions.console || console,
    Date: { now: () => runtimeOptions.now ?? 1_000_000 },
    setTimeout: runtimeOptions.setTimeout || setTimeout,
    clearTimeout: runtimeOptions.clearTimeout || clearTimeout,
  };
  vm.runInNewContext(read("background.js"), context, { filename: "background.js" });
  return fake;
}

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(`  ${error.message}`);
    failures.push({ name, error });
  }
}

test("background startup restores only a future persisted alarm", () => {
  const fake = loadBackground({ ft_timer_end: 1_000_500, ft_timer_type: "work" });
  assert.deepEqual(fake.listenerCounts(), { runtime: 1, alarms: 1 });
  assert.deepEqual(
    fake.calls.alarms.filter((call) => call.action === "create"),
    [{ action: "create", name: "focusTubeTimer", info: { when: 1_000_500 } }],
  );
});

test("startup alarm recreation failure schedules an identity-safe retry", () => {
  const fake = loadBackground(
    { ft_timer_end: 2_000_000, ft_timer_type: "work" },
    { now: 1_000_000, failAlarmCreate: true },
  );
  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  assert.ok(retry);
  assert.match(retry.name, /2000000.*work.*1/);
  assert.deepEqual(fake.state, { ft_timer_end: 2_000_000, ft_timer_type: "work" });
});

test("expired startup clears state silently without synthetic break", () => {
  const fake = loadBackground({ ft_timer_end: 999_500, ft_timer_type: "work" });
  fake.fireStartup();
  assert.deepEqual(fake.calls.notifications, []);
  assert.deepEqual(fake.calls.tabMessages, []);
  assert.deepEqual(fake.calls.runtimeMessages, []);
  assert.deepEqual(fake.calls.sets, []);
  assert.deepEqual(fake.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_work_session_ended"]]);
});

test("deferred expired startup does not claim a timer disabled during alarm lookup", () => {
  const deferredAlarmGets = [];
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, deferAlarmGets: deferredAlarmGets },
  );
  fake.activeAlarms.set("focusTubeTimer", { when: 999_000 });
  fake.fireStartup();
  fake.externalStorage({ ft_enabled: false });
  fake.flushAlarmGets();

  assert.equal(fake.state.ft_timer_completion_claim, undefined);
  assert.equal(fake.state.ft_timer_end, undefined);
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  assert.equal(fake.calls.runtimeMessages.length, 0);
  assert.equal(fake.calls.notifications.length, 0);
});

test("deferred expired startup does not silently remove a timer enabled during alarm lookup", () => {
  const deferredAlarmGets = [];
  const fake = loadBackground(
    { ft_enabled: false, ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, deferAlarmGets: deferredAlarmGets },
  );
  fake.activeAlarms.set("focusTubeTimer", { when: 999_000 });
  fake.fireStartup();
  fake.externalStorage({ ft_enabled: true });
  fake.flushAlarmGets();

  assert.equal(fake.state.ft_enabled, true);
  assert.equal(fake.state.ft_timer_end, 999_000);
  assert.equal(fake.state.ft_timer_type, "break");
  assert.equal(fake.state.ft_timer_completion_claim, undefined);
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 999_000);
  assert.equal(fake.calls.removes.length, 0);
});

test("matching late alarm completes the persisted timer", () => {
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  }, { now: 998_000 });
  fake.setNow(1_000_000);
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  assert.equal(fake.calls.notifications.length, 1);
  assert.equal(fake.calls.tabMessages.length, 1);
  assert.deepEqual(fake.calls.removes.at(-1), ["ft_timer_end", "ft_timer_type", "ft_timer_completion_claim"]);
});

test("cold alarm wake completes once before startup reconciliation can delete the timer", () => {
  const deferred = [];
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  }, { now: 1_000_000, deferGets: deferred });

  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  while (deferred.length) deferred.shift()();

  assert.deepEqual({
    notifications: fake.calls.notifications.length,
    runtimeMessages: fake.calls.runtimeMessages,
    tabMessages: fake.calls.tabMessages,
    removes: fake.calls.removes,
  }, {
    notifications: 1,
    runtimeMessages: [{
      action: "TIMER_COMPLETE",
      target: "extension",
      type: "break",
      breakDuration: 5,
    }],
    tabMessages: [{
      tabId: 11,
      message: {
        action: "TIMER_COMPLETE",
        target: "content",
        type: "break",
        breakDuration: 5,
      },
    }],
    removes: [["ft_timer_end", "ft_timer_type", "ft_timer_completion_claim"]],
  });
});

test("a queued extension-page replacement wins after timer completion", () => {
  const deferred = [];
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "work",
    showNotifications: false,
  }, { now: 1_000_000, deferGets: deferred });
  fake.setNow(1_000_000);
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  fake.sendRuntimeMessage({ action: "replaceSettings", settings: { newSetting: 7 } }, {
    id: "test-extension",
    url: "chrome-extension://test-extension/options.html",
  });
  while (deferred.length) deferred.shift()();

  assert.deepEqual(fake.state, { newSetting: 7 });
});

test("a replacement before a stale alarm leaves the replacement untouched", () => {
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: false,
  });
  fake.sendRuntimeMessage({
    action: "replaceSettings",
    settings: { ft_timer_end: 2_000_000, ft_timer_type: "work" },
  }, {
    id: "test-extension",
    url: "chrome-extension://test-extension/options.html",
  });
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  assert.deepEqual(fake.state, {
    ft_timer_end: 2_000_000,
    ft_timer_type: "work",
  });
  assert.deepEqual(fake.calls.removes, [["showNotifications"]]);
});

test("startup storage read failure leaves the timer alarm untouched", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { getErrors: [true] },
  );

  assert.deepEqual(fake.calls.alarms, []);
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work" });
});

test("reconcile storage read failure leaves the timer alarm untouched", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { getErrors: [false, true] },
  );
  fake.fireStorage({ ft_timer_end: { oldValue: 1_000_500, newValue: 1_000_600 } });

  assert.deepEqual(fake.calls.alarms, [
    { action: "create", name: "focusTubeTimer", info: { when: 1_000_500 } },
  ]);
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work" });
});

test("stopTimer does not report stopped when storage removal fails", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { failRemove: true },
  );

  const response = fake.sendRuntimeMessage({ action: "stopTimer" });
  assert.equal(response.length, 1);
  assert.equal(response[0].stopped, false);
  assert.equal(response[0].error, "storage_remove_failed");
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work" });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
});

test("tabs query failure still completes the expired timer transition", () => {
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  }, { now: 998_000, failTabsQuery: true });
  fake.setNow(1_000_000);
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  assert.equal(fake.calls.runtimeMessages.length, 1);
  assert.deepEqual(fake.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_timer_completion_claim"]]);
  assert.deepEqual(fake.state, { showNotifications: true });
});

test("notification preference read failure completes without an OS notification", () => {
  const fake = loadBackground({
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  }, {
    now: 998_000,
    getError: (keys) => Array.isArray(keys) && keys.length === 1 && keys[0] === "showNotifications",
  });
  fake.setNow(1_000_000);
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  assert.deepEqual(fake.calls.notifications, []);
  assert.equal(fake.calls.runtimeMessages.length, 1);
  assert.deepEqual(fake.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_timer_completion_claim"]]);
});

for (const stale of [
  { name: "wrong-name", scheduledTime: 1_000_000 },
  { name: "focusTubeTimer", scheduledTime: 1_000_001 },
  { name: "focusTubeTimer", scheduledTime: 1_000_000, missing: true },
]) {
  test(`stale alarm (${stale.name}/${stale.scheduledTime}) has no side effects`, () => {
    const initial = stale.missing ? {} : { ft_timer_end: 1_000_000, ft_timer_type: "work" };
    const fake = loadBackground(initial, { now: 999_000 });
    fake.fireAlarm(stale);
    assert.deepEqual(fake.calls.notifications, []);
    assert.deepEqual(fake.calls.tabMessages, []);
    assert.deepEqual(fake.calls.sets, []);
    assert.deepEqual(fake.calls.removes, []);
  });
}

test("alarm processing cannot clobber a replacement timer", () => {
  const deferred = [];
  const fake = loadBackground({ ft_timer_end: 1_000_000, ft_timer_type: "work" }, { deferGets: deferred });
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_000 });
  fake.fireStorage({ ft_timer_end: { oldValue: 1_000_000, newValue: 2_000_000 } });
  fake.state.ft_timer_end = 2_000_000;
  fake.state.ft_timer_type = "work";
  while (deferred.length) deferred.shift()();
  assert.deepEqual(fake.calls.notifications, []);
  assert.deepEqual(fake.calls.tabMessages, []);
  assert.equal(fake.calls.sets.some((set) => set.ft_timer_end !== undefined), false);
});

test("work completion makes one break transition and break completion clears once", () => {
  const work = loadBackground({
    ft_timer_end: 1_000_000,
    ft_timer_type: "work",
    breakDuration: 5,
    autoStartBreaks: true,
  }, { now: 999_000 });
  work.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_000 });
  assert.equal(work.calls.tabMessages.length, 1);
  assert.equal(work.calls.sets.filter((set) => set.ft_timer_type === "break").length, 1);

  const rest = loadBackground(
    { ft_timer_end: 1_000_000, ft_timer_type: "break" },
    { now: 999_000 },
  );
  rest.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_000 });
  assert.deepEqual(rest.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_timer_completion_claim"]]);
});

function assertPrimaryAlarmMatchesPersistedTimer(fake) {
  const primaryCreates = fake.calls.alarms.filter(
    (call) => call.action === "create" && call.name === "focusTubeTimer",
  );
  assert.ok(primaryCreates.length >= 1, "background timer writer should create focusTubeTimer");
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, fake.state.ft_timer_end);
  assert.equal(primaryCreates.at(-1).info.when, fake.state.ft_timer_end);
}

test("startTimer writes the primary alarm at the persisted timer end", () => {
  const fake = loadBackground({}, { now: 1_000_000 });

  fake.sendRuntimeMessage({ action: "startTimer", duration: 2 });

  assert.equal(fake.state.ft_timer_type, "work");
  assertPrimaryAlarmMatchesPersistedTimer(fake);
});

test("startBreak writes the primary alarm at the persisted timer end", () => {
  const fake = loadBackground({}, { now: 1_000_000 });

  fake.sendRuntimeMessage({ action: "startBreak", duration: 3 });

  assert.equal(fake.state.ft_timer_type, "break");
  assertPrimaryAlarmMatchesPersistedTimer(fake);
});

test("automatic work completion updates the primary alarm for the persisted break end", () => {
  const fake = loadBackground({
    ft_timer_end: 1_000_000,
    ft_timer_type: "work",
    breakDuration: 5,
    autoStartBreaks: true,
  }, { now: 999_000 });

  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_000 });

  assert.equal(fake.state.ft_timer_type, "break");
  assertPrimaryAlarmMatchesPersistedTimer(fake);
});

test("all user-facing timer commands are serialized and startBreak clears the ended marker", () => {
  const fake = loadBackground({ ft_work_session_ended: true, ft_timer_duration: 1 });

  fake.sendRuntimeMessage({ action: "startTimer", duration: 1 });
  fake.sendRuntimeMessage({ action: "startBreak", duration: 1 });

  assert.deepEqual(fake.calls.removes.slice(-2), [
    ["ft_work_session_ended"],
    ["ft_work_session_ended"],
  ]);
  assert.deepEqual(fake.state, {
    ft_timer_duration: 1,
    ft_timer_end: 1_060_000,
    ft_timer_type: "break",
  });
  assert.deepEqual(
    fake.calls.sets.slice(-2).map((values) => values.ft_timer_type),
    ["work", "break"],
  );
});

test("the second stopTimer validation read failure returns the storage read error", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { getErrors: [false, false, true] },
  );

  const response = fake.sendRuntimeMessage({ action: "stopTimer" });

  assert.equal(
    JSON.stringify(response),
    JSON.stringify([{ stopped: false, error: "storage_read_failed" }]),
  );
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work" });
  assert.deepEqual(fake.calls.removes, []);
});

test("settings replacement accepts only an extension-page command and reconciles the alarm", () => {
  const fake = loadBackground({
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
    oldSetting: true,
  });
  const extensionPage = {
    id: "test-extension",
    url: "chrome-extension://test-extension/options.html",
  };

  fake.sendRuntimeMessage({ action: "replaceSettings", settings: { newSetting: 7 } }, extensionPage);
  assert.deepEqual(fake.state, { newSetting: 7 });
  assert.equal(fake.calls.alarms.some((call) => call.action === "clear"), true);

  const before = { ...fake.state };
  fake.sendRuntimeMessage({ action: "replaceSettings", settings: { rejected: true } }, {
    id: "other-extension",
    url: "chrome-extension://other/options.html",
  });
  fake.sendRuntimeMessage({ action: "replaceSettings", settings: [] }, extensionPage);
  assert.deepEqual(fake.state, before);
});

test("settings replacement restores old storage when expired-timer removal fails", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work", oldSetting: true },
    { failRemove: true },
  );
  const sender = {
    id: "test-extension",
    url: "chrome-extension://test-extension/options.html",
  };

  const response = fake.sendRuntimeMessage(
    {
      action: "replaceSettings",
      settings: { ft_timer_end: 999_000, ft_timer_type: "work", newSetting: true },
    },
    sender,
  );

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "storage_remove_failed" }]));
  assert.deepEqual(fake.state, {
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
    oldSetting: true,
  });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
});

test("settings replacement rolls back storage and primary alarm when new alarm creation fails", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true },
    { now: 1_000_000 },
  );
  fake.setAlarmCreateFailures(1);
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { ft_timer_end: 2_000_000, ft_timer_type: "break", next: true } },
    { id: "test-extension", url: "chrome-extension://test-extension/options.html" },
  );

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "alarm_create_failed" }]));
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true });
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 1_000_500);
});

test("replacement start restores the prior timer and primary alarm after alarm failure", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true },
    { now: 1_000_000 },
  );
  fake.setAlarmCreateFailures(1);

  const response = fake.sendRuntimeMessage({ action: "startTimer", duration: 2, type: "break" });

  assert.equal(JSON.stringify(response), JSON.stringify([{ started: false, error: "alarm_create_failed" }]));
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true });
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 1_000_500);
});

test("Firefox extension sender uses chrome.runtime.getURL(\"\") identity and rejects cross-extension senders", () => {
  const fake = loadBackground({ old: true }, {
    getURL: (file) => `moz-extension://runtime-host/${file}`,
  });
  assert.equal(fake.chrome.runtime.getURL(""), "moz-extension://runtime-host/");
  const accepted = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { accepted: true } },
    { id: "test-extension", url: "moz-extension://runtime-host/options.html" },
  );
  const rejected = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { rejected: true } },
    { id: "other-extension", url: "moz-extension://runtime-host/options.html" },
  );
  assert.equal(JSON.stringify(accepted), JSON.stringify([{ replaced: true }]));
  assert.deepEqual(rejected, []);
  assert.deepEqual(fake.state, { accepted: true });
});

test("replacement set failure preserves old storage and primary alarm", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true },
    { failSets: 1 },
  );
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { next: true } },
    { id: "test-extension", url: "chrome-extension://test-extension/options.html" },
  );
  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "storage_set_failed" }]));
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
});

test("stopTimer clears the primary alarm only after timer removal succeeds", () => {
  const failed = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { failRemove: true },
  );
  failed.sendRuntimeMessage({ action: "stopTimer" });
  assert.equal(failed.activeAlarms.has("focusTubeTimer"), true);

  const succeeded = loadBackground({ ft_timer_end: 1_000_500, ft_timer_type: "work" });
  succeeded.sendRuntimeMessage({ action: "stopTimer" });
  assert.equal(succeeded.activeAlarms.has("focusTubeTimer"), false);
});

test("stopTimer restores timer state and marker when alarm clearing fails", () => {
  const fake = loadBackground({
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
    ft_work_session_ended: true,
  }, { failAlarmClear: true });

  const response = fake.sendRuntimeMessage({ action: "stopTimer" });

  assert.equal(JSON.stringify(response), JSON.stringify([{ stopped: false, error: "alarm_clear_failed" }]));
  assert.deepEqual(fake.state, {
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
    ft_work_session_ended: true,
  });
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 1_000_500);
});

test("disable retains the primary alarm when timer storage removal fails", () => {
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { failRemove: true },
  );
  fake.state.ft_enabled = false;
  fake.fireStorage({ ft_enabled: { oldValue: true, newValue: false } });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
  assert.deepEqual(fake.state, {
    ft_enabled: false,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });
});

test("completion retries persist timer identity and attempt across fresh contexts", () => {
  const state = { ft_timer_end: 999_000, ft_timer_type: "break" };
  let alarm = { name: "focusTubeTimer", scheduledTime: 999_000 };
  for (const attempt of [1, 2, 3]) {
    const fake = loadBackground(state, { state, now: 1_000_000, failRemove: true });
    fake.fireAlarm(alarm);
    const next = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
    assert.ok(next, `attempt ${attempt} should schedule a retry`);
    assert.match(next.name, new RegExp(`999000.*break.*${attempt}`));
    alarm = { name: next.name, scheduledTime: next.info.when + 10 };
  }
  const exhausted = loadBackground(state, { state, now: 1_000_000, failRemove: true });
  exhausted.fireAlarm(alarm);
  assert.equal(exhausted.calls.alarms.some((call) => call.action === "create" && call.name !== "focusTubeTimer"), false);
});

test("a late retry for an old timer cannot complete a newer expired timer", () => {
  const state = { ft_timer_end: 999_000, ft_timer_type: "break" };
  const first = loadBackground(state, { state, now: 1_000_000, failRemove: true });
  first.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  const retry = first.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  state.ft_timer_end = 1_500_000;
  state.ft_timer_type = "work";
  const fresh = loadBackground(state, { state, now: 1_500_010 });
  fresh.fireAlarm({ name: retry.name, scheduledTime: 999_000 });
  assert.deepEqual(state, {
    ft_timer_end: 1_500_000,
    ft_timer_type: "work",
    ft_timer_completion_claim: "999000:break",
  });
  assert.deepEqual(fresh.calls.runtimeMessages, []);
  assert.deepEqual(fresh.calls.tabMessages, []);
});

test("partial timer change events do not restore an incomplete imported timer", () => {
  const fake = loadBackground({ ft_timer_type: "work" });
  fake.state.ft_timer_end = 2_000_000;
  fake.fireStorage({ ft_timer_end: { oldValue: undefined, newValue: 2_000_000 } });

  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  assert.deepEqual(fake.state, { ft_timer_type: "work", ft_timer_end: 2_000_000 });
});

test("completion write failure logs a diagnostic and schedules bounded retry without changing timer state", () => {
  const errors = [];
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work", autoStartBreaks: false },
    { now: 1_000_000, failSets: 1, console: { error: (...args) => errors.push(args) } },
  );

  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  assert.equal(errors.some((args) => args.join(" ").toLowerCase().includes("timer")), true);
  assert.deepEqual(fake.state, {
    ft_timer_end: 999_000,
    ft_timer_type: "work",
    autoStartBreaks: false,
  });
  assert.equal(
    fake.calls.alarms.filter((call) => call.action === "create").length >= 1,
    true,
  );
});

test("completion retry does not duplicate completion side effects", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work", autoStartBreaks: false },
    { now: 1_000_000, failSets: 1 },
  );
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  assert.ok(retry);
  fake.fireAlarm({ name: retry.name, scheduledTime: retry.info.when });

  assert.equal(fake.calls.notifications.length, 1);
  assert.equal(fake.calls.runtimeMessages.filter((message) => message.action === "TIMER_COMPLETE").length, 1);
  assert.equal(fake.calls.tabMessages.length, 1);
  assert.deepEqual(fake.state, { ft_work_session_ended: true, autoStartBreaks: false });
});

test("a retry can complete the unchanged expired timer but cannot affect a newer timer", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, failRemoves: 1 },
  );

  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  assert.deepEqual(fake.state, {
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    ft_timer_completion_claim: "999000:break",
  });
  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  assert.ok(retry);

  fake.fireAlarm({ name: retry.name, scheduledTime: retry.info.when });
  assert.deepEqual(fake.state, {});

  fake.externalStorage({ ft_timer_end: 2_000_000, ft_timer_type: "work" });
  fake.fireAlarm({ name: retry.name, scheduledTime: retry.info.when });
  assert.deepEqual(fake.state, { ft_timer_end: 2_000_000, ft_timer_type: "work" });
});

test("stopTimer reports timer_changed when the timer changes during validation", () => {
  const deferred = [];
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { deferGets: deferred },
  );

  const responses = fake.sendRuntimeMessage({ action: "stopTimer" });
  deferred.shift()();
  fake.externalStorage({ ft_timer_end: 2_000_000, ft_timer_type: "break" });
  while (deferred.length) deferred.shift()();

  assert.equal(JSON.stringify(responses), JSON.stringify([{ stopped: false, error: "timer_changed" }]));
  assert.deepEqual(fake.state, { ft_timer_end: 2_000_000, ft_timer_type: "break" });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
});

const extensionPageSender = {
  id: "test-extension",
  url: "chrome-extension://test-extension/options.html",
};

test("disabling settings removes timer state and ended marker before clearing the primary alarm", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
    ft_work_session_ended: true,
  });

  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { ft_enabled: false } },
    extensionPageSender,
  );
  fake.flushStorageEvents();

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: true }]));
  assert.deepEqual(fake.state, { ft_enabled: false });
  assert.deepEqual(fake.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_work_session_ended"]]);
  assert.ok(fake.calls.order.findIndex((entry) => entry.action === "remove") <
    fake.calls.order.findIndex((entry) => entry.action === "alarm-clear"));
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("external disable removes persisted timer state and primary alarm", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });
  fake.externalStorage({ ft_enabled: false });
  assert.deepEqual(fake.state, { ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  assert.ok(fake.calls.order.findIndex((entry) => entry.action === "remove") <
    fake.calls.order.findIndex((entry) => entry.action === "alarm-clear"));
});

test("replaceSettings retires its internal disable marker after prerequisite read failure", () => {
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { getErrors: [true] },
  );
  fake.sendRuntimeMessage({ action: "replaceSettings", settings: { ft_enabled: false } }, extensionPageSender);
  fake.externalStorage({ ft_enabled: false });
  assert.deepEqual(fake.state, { ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("replaceSettings retires its internal disable marker after alarm read failure", () => {
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { getAlarmErrors: [true] },
  );
  fake.sendRuntimeMessage({ action: "replaceSettings", settings: { ft_enabled: false } }, extensionPageSender);
  fake.externalStorage({ ft_enabled: false });
  assert.deepEqual(fake.state, { ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("same-value disable writes do not suppress a later external disable", () => {
  const fake = loadBackground({
    ft_enabled: false,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });
  fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: false });
  fake.flushStorageEvents();
  fake.activeAlarms.set("focusTubeTimer", { when: 1_000_500 });
  fake.externalStorage({ ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("external disable during enable verification still cleans the old timer", () => {
  let reads = 0;
  let fake;
  fake = loadBackground(
    { ft_enabled: false, ft_timer_end: 1_060_000, ft_timer_type: "work" },
    {
      now: 1_000_000,
      onGet(keys) {
        if (Array.isArray(keys) && keys.length === 1 && keys[0] === "ft_enabled") {
          reads += 1;
          if (reads === 2) fake.externalStorage({ ft_enabled: false });
        }
      },
    },
  );

  const response = fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: true });

  assert.equal(JSON.stringify(response), JSON.stringify([{ enabled: true }]));
  assert.deepEqual(fake.state, { ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  assert.deepEqual(fake.calls.removes, [["ft_timer_end", "ft_timer_type", "ft_work_session_ended"]]);
});

test("setExtensionEnabled retires its marker when alarm clearing fails", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  }, { failAlarmClear: true });
  const response = fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: false });
  assert.equal(JSON.stringify(response), JSON.stringify([{ enabled: false, error: "alarm_clear_failed" }]));
  fake.setAlarmClearFailure(false);
  fake.activeAlarms.set("focusTubeTimer", { when: 1_000_500 });
  fake.externalStorage({ ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("setExtensionEnabled reports timer removal failure and releases its operation", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  }, { failRemove: true });

  const response = fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: false });
  assert.equal(JSON.stringify(response), JSON.stringify([
    { enabled: false, error: "storage_remove_failed" },
  ]));

  fake.setRemoveFailure(false);
  fake.activeAlarms.set("focusTubeTimer", { when: 1_000_500 });
  fake.externalStorage({ ft_enabled: false });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("same-value enable no-op has no marker and delayed events do not trigger cleanup", () => {
  const fake = loadBackground({
    ft_enabled: false,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });

  const response = fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: false });
  fake.flushStorageEvents();
  fake.activeAlarms.set("focusTubeTimer", { when: 1_000_500 });
  fake.externalStorage({ ft_enabled: false });

  assert.equal(JSON.stringify(response), JSON.stringify([{ enabled: false }]));
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("replacement disable and a later real external false survive absent and delayed events", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });

  const replacement = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { ft_enabled: false } },
    extensionPageSender,
  );
  assert.equal(JSON.stringify(replacement), JSON.stringify([{ replaced: true }]));

  // Leave the replacement's storage event delayed, as it can be in Chromium.
  const enabled = fake.sendRuntimeMessage({ action: "setExtensionEnabled", enabled: true });
  assert.equal(JSON.stringify(enabled), JSON.stringify([{ enabled: true }]));

  const started = fake.sendRuntimeMessage({ action: "startTimer", duration: 1 });
  assert.equal(started.length, 1);
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);

  fake.externalStorage({ ft_enabled: false });
  assert.equal(fake.state.ft_enabled, false);
  assert.equal(fake.state.ft_timer_end, undefined);
  assert.equal(fake.state.ft_timer_type, undefined);
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);

  // Deliver the delayed internal events after the real external disable.
  fake.flushStorageEvents();
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("dismissEndedPrompt reports marker removal failure", () => {
  const fake = loadBackground({ ft_work_session_ended: true }, { failRemove: true });
  const response = fake.sendRuntimeMessage({ action: "dismissEndedPrompt" });
  assert.equal(JSON.stringify(response), JSON.stringify([{ dismissed: false, error: "storage_remove_failed" }]));
  assert.equal(fake.state.ft_work_session_ended, true);
});

test("replaceSettings rolls back when stale primary alarm clear fails", () => {
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 1_000_500, ft_timer_type: "work" },
    { now: 1_000_000, failAlarmClear: true },
  );
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { ft_enabled: true, next: true } },
    extensionPageSender,
  );
  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "alarm_clear_failed" }]));
  assert.deepEqual(fake.state, { ft_enabled: true, ft_timer_end: 1_000_500, ft_timer_type: "work" });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
});

test("disable during completion suppresses notification, runtime, and tab side effects", () => {
  const deferred = [];
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  }, { now: 1_000_000, deferGets: deferred });

  deferred.shift()();
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  fake.chrome.storage.local.set({ ft_enabled: false });
  fake.flushStorageEvents();
  while (deferred.length) deferred.shift()();

  assert.deepEqual(fake.calls.notifications, []);
  assert.deepEqual(fake.calls.runtimeMessages, []);
  assert.deepEqual(fake.calls.tabMessages, []);
});

test("false to true before queued disable cleanup preserves a valid timer", () => {
  const fake = loadBackground({
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });

  fake.chrome.storage.local.set({ ft_enabled: false });
  fake.chrome.storage.local.set({ ft_enabled: true });
  fake.flushStorageEvents();

  assert.deepEqual(fake.state, {
    ft_enabled: true,
    ft_timer_end: 1_000_500,
    ft_timer_type: "work",
  });
  assert.deepEqual(fake.calls.removes, []);
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 1_000_500);
});

for (const action of ["startTimer", "startBreak"]) {
  test(`${action} returns a structured error when prerequisite marker removal fails`, () => {
    const fake = loadBackground({ ft_work_session_ended: true }, { failRemove: true });
    const response = fake.sendRuntimeMessage({ action, duration: 1 });
    assert.equal(JSON.stringify(response), JSON.stringify([{ started: false, error: "storage_remove_failed" }]));
    assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  });

  test(`${action} returns a structured error when timer storage fails`, () => {
    const fake = loadBackground({}, { failSet: true });
    const response = fake.sendRuntimeMessage({ action, duration: 1 });
    assert.equal(JSON.stringify(response), JSON.stringify([{ started: false, error: "storage_set_failed" }]));
    assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
  });

  test(`${action} returns an alarm error when primary alarm creation fails`, () => {
    const fake = loadBackground({}, { failAlarmCreate: true });
    const response = fake.sendRuntimeMessage({ action, duration: 1 });
    assert.equal(JSON.stringify(response), JSON.stringify([{ started: false, error: "alarm_create_failed" }]));
    assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
    assert.equal(fake.state.ft_timer_end !== undefined, false);
  });
}

test("retry alarm creation failure logs a diagnostic and preserves the expired timer", () => {
  const errors = [];
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, failRemove: true, failAlarmCreate: true, console: { error: (...args) => errors.push(args) } },
  );
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  assert.deepEqual(fake.state, {
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    ft_timer_completion_claim: "999000:break",
  });
  assert.equal(errors.some((args) => args.join(" ").toLowerCase().includes("alarm")), true);
  assert.equal(fake.calls.alarms.some((call) => call.action === "create" && call.name !== "focusTubeTimer"), true);
});

test("initial primary alarm snapshot read failure defers without a wildcard retry", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, getErrors: [false, true] },
  );
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");

  assert.equal(retry, undefined);
  assert.deepEqual(fake.state, { ft_timer_end: 999_000, ft_timer_type: "break" });
});

test("a same-end different-type retry cannot complete a replacement timer", () => {
  const state = { ft_timer_end: 999_000, ft_timer_type: "break" };
  const replacement = loadBackground(state, { state, now: 1_000_000 });
  replacement.fireAlarm({
    name: "focusTubeTimerRetry:999000:work:1",
    scheduledTime: 1_001_000,
  });

  assert.deepEqual(state, { ft_timer_end: 999_000, ft_timer_type: "break" });
  assert.deepEqual(replacement.calls.runtimeMessages, []);
  assert.deepEqual(replacement.calls.tabMessages, []);
});

test("break transition alarm failure retries the new break identity", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work", breakDuration: 5 },
    { now: 1_000_000, failAlarmCreate: true },
  );

  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });

  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  assert.ok(retry);
  assert.match(retry.name, /break/);
  assert.deepEqual(fake.state.ft_timer_type, "break");
});

test("break transition storage failure retries the still-durable work identity", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work", breakDuration: 5 },
    { now: 1_000_000, failSets: 1 },
  );
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  const retry = fake.calls.alarms.find((call) => call.action === "create" && call.name !== "focusTubeTimer");
  assert.ok(retry);
  assert.match(retry.name, /999000.*work.*1/);
  assert.deepEqual(fake.state, { ft_timer_end: 999_000, ft_timer_type: "work", breakDuration: 5 });
});

for (const ordering of ["startup-then-alarm", "alarm-then-startup"]) {
  test(`startup and overdue primary alarm complete once in ${ordering} ordering`, () => {
    const fake = loadBackground(
      { ft_timer_end: 1_000_500, ft_timer_type: "break", showNotifications: true },
      { now: 1_000_000 },
    );
    fake.setNow(1_001_000);
    if (ordering === "startup-then-alarm") {
      fake.fireStartup();
      fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_500 });
    } else {
      fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 1_000_500 });
      fake.fireStartup();
    }

    assert.equal(fake.calls.runtimeMessages.filter((message) => message.action === "TIMER_COMPLETE").length, 1);
    assert.equal(fake.calls.notifications.length, 1);
    assert.equal(fake.calls.removes.filter((keys) => keys.includes("ft_timer_end")).length, 1);
  });
}

test("explicit startup with no matching persisted alarm cleans silently", () => {
  const fake = loadBackground({ ft_enabled: true }, { now: 1_000_000 });
  fake.fireStartup();
  assert.deepEqual(fake.calls.notifications, []);
  assert.deepEqual(fake.calls.runtimeMessages, []);
  assert.deepEqual(fake.calls.tabMessages, []);
  assert.deepEqual(fake.calls.removes, []);
});

test("explicit startup defers expired cleanup when primary alarm lookup fails", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work" },
    { now: 1_000_000, getAlarmErrors: [true] },
  );
  fake.activeAlarms.set("focusTubeTimer", { when: 999_000 });

  fake.fireStartup();

  assert.deepEqual(fake.state, { ft_timer_end: 999_000, ft_timer_type: "work" });
  assert.equal(fake.activeAlarms.get("focusTubeTimer")?.when, 999_000);
  assert.deepEqual(fake.calls.removes, []);
});

test("rollback restore failure returns storage_rollback_failed without expired cleanup", () => {
  const fake = loadBackground(
    { ft_timer_end: 999_000, ft_timer_type: "work", old: true },
    { now: 1_000_000, failSets: 2 },
  );
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { ft_timer_end: 999_000, ft_timer_type: "work", next: true } },
    extensionPageSender,
  );

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "storage_rollback_failed" }]));
  assert.deepEqual(fake.calls.removes.filter((keys) => keys.includes("ft_timer_end")), []);
  assert.equal(fake.calls.alarms.some((call) => call.action === "clear"), true);
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("replacement rollback with no prior alarm clears the current alarm after storage rollback failure", () => {
  let timerReads = 0;
  const fake = loadBackground({}, {
    now: 1_000_000,
    failSets: 1,
    failAlarmClear: true,
    onGet(keys, api) {
      if (Array.isArray(keys) && keys.includes("ft_timer_end") && ++timerReads > 1) {
        api.result.ft_timer_end = 999_000;
        api.result.ft_timer_type = "work";
        api.activeAlarms.set("focusTubeTimer", { when: 1_001_000 });
      }
    },
  });
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { next: true } },
    extensionPageSender,
  );

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "storage_rollback_failed" }]));
  assert.equal(fake.calls.alarms.some((call) => call.action === "clear"), true);
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), false);
});

test("permanent obsolete-key removal failure preserves old storage and alarm", () => {
  const fake = loadBackground(
    { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true },
    { failRemove: true },
  );
  const response = fake.sendRuntimeMessage(
    { action: "replaceSettings", settings: { next: true } },
    extensionPageSender,
  );

  assert.equal(JSON.stringify(response), JSON.stringify([{ replaced: false, error: "storage_remove_failed" }]));
  assert.deepEqual(fake.state, { ft_timer_end: 1_000_500, ft_timer_type: "work", old: true });
  assert.equal(fake.activeAlarms.has("focusTubeTimer"), true);
  assert.equal(fake.calls.alarms.some((call) => call.action === "clear"), false);
});

test("completion final validation cannot clobber a queued replacement or disable", () => {
  const deferred = [];
  const fake = loadBackground(
    { ft_enabled: true, ft_timer_end: 999_000, ft_timer_type: "break" },
    { now: 1_000_000, deferGets: deferred },
  );
  deferred.shift()();
  fake.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  fake.chrome.storage.local.set({ ft_enabled: false });
  fake.chrome.storage.local.set({ ft_timer_end: 2_000_000, ft_timer_type: "work" });
  fake.flushStorageEvents();
  while (deferred.length) deferred.shift()();

  assert.deepEqual(fake.state, {
    ft_enabled: false,
    ft_timer_end: 2_000_000,
    ft_timer_type: "work",
  });
  assert.deepEqual(fake.calls.notifications, []);
  assert.deepEqual(fake.calls.runtimeMessages, []);
  assert.deepEqual(fake.calls.tabMessages, []);
});

test("startup then primary alarm with transient removal failure has side effects once", () => {
  const state = {
    ft_timer_end: 999_000,
    ft_timer_type: "break",
    showNotifications: true,
  };
  const first = loadBackground(state, { state, now: 1_000_000, failRemoves: 1 });
  first.activeAlarms.set("focusTubeTimer", { when: 999_000 });
  first.fireStartup();
  first.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  assert.equal(first.calls.notifications.length, 1);

  const second = loadBackground(state, { state, now: 1_000_000 });
  second.fireAlarm({ name: "focusTubeTimer", scheduledTime: 999_000 });
  assert.equal(second.calls.notifications.length, 0);
  assert.equal(second.calls.runtimeMessages.length, 0);
  assert.equal(second.calls.tabMessages.length, 0);
  assert.deepEqual(state, { showNotifications: true });
});

function loadPlatform(platform) {
  const observers = [];
  const timers = [];
  const cleared = [];
  const listeners = [];
  const document = {
    body: { classList: { add() {} }, querySelectorAll: () => [] },
    documentElement: {},
    addEventListener: (name, listener) => listeners.push({ name, listener }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const storageListeners = [];
  const context = {
    console,
    document,
    window: { __ftSettingsReady: false, location: { pathname: "/" }, addEventListener() {} },
    location: { hostname: `${platform}.example.test` },
    MutationObserver: FakeMutationObserver,
    setTimeout: (callback) => { const id = timers.length + 1; timers.push({ id, callback }); return id; },
    clearTimeout: (id) => cleared.push(id),
    chrome: {
      runtime: { id: "test-extension" },
      storage: { onChanged: { addListener: (listener) => storageListeners.push(listener) } },
    },
    Site: { isIG: () => platform === "instagram", isTT: () => platform === "tiktok", isFB: () => platform === "facebook" },
    CONFIG: { extensionEnabled: true, platformSettings: { ig: "strict", tt: "strict", fb: "strict" }, visualHiding: {}, popupVisibility: {}, visualHideHidden: true },
    FocusState: { shouldBlock: false, isBreak: false, isWork: false },
    UI: { remove() {} },
    Utils: {
      ensureBody: (callback) => callback(),
      isExtensionEnabled: () => true,
      trackObserver: (observer) => observer,
      registerLifecycle() {},
      clearSession() {},
      consumeKick() {},
      isSessionAllowed: () => false,
      shouldApplyVisualHiding: () => true,
      debugLog() {},
      restoreInlineStyle() {},
      setInlineStyle() {},
      getExtensionUrl: () => "icon",
    },
  };
  const source = platform === "instagram" ? "content-ig.js" : platform === "tiktok" ? "content-tt.js" : "content-fb.js";
  vm.runInNewContext(`${read(source)}\nthis.target = ${platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "Facebook"};`, context, { filename: source });
  return { target: context.target, observers, timers, cleared, document };
}

for (const platform of ["instagram", "tiktok", "facebook"]) {
  test(`${platform} mutation bursts schedule one non-resetting pending check`, () => {
    const fake = loadPlatform(platform);
    let checks = 0;
    fake.target.runChecks = () => { checks += 1; };
    fake.target.ensureObservers();
    fake.observers[0].callback();
    fake.observers[0].callback();
    fake.observers[0].callback();
    assert.equal(fake.timers.length, 1);
    fake.timers[0].callback();
    assert.equal(checks, 1);
    fake.observers[0].callback();
    assert.equal(fake.timers.length, 2);
  });

  test(`${platform} disable cancels its pending mutation check and re-enable schedules again`, () => {
    const fake = loadPlatform(platform);
    fake.target.runChecks = () => {};
    fake.target.applyVisible = () => {};
    fake.target.restoreHidden = () => {};
    fake.target.removeStoriesOverlay = () => {};
    fake.target.applyReelsHiding = () => {};
    fake.target.applyPeopleYouMightKnowHiding = () => {};
    fake.target.restoreHiddenNavContainers = () => {};
    fake.target.ensureObservers();
    fake.observers[0].callback();
    fake.target.disable();
    assert.ok(fake.cleared.length >= 1);
    fake.target.enable();
    fake.observers.at(-1).callback();
    assert.equal(fake.timers.length, 2);
  });
}

test("ensureBody tracks and disconnects the pre-body observer", () => {
  const observers = [];
  let body = null;
  const context = {
    document: { get body() { return body; }, documentElement: {} },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    chrome: { runtime: { id: "test-extension" } },
    sessionStorage: { removeItem() {} },
  };
  const start = read("content-common.js").indexOf("const Utils = {");
  const end = read("content-common.js").indexOf("const UI = {");
  vm.runInNewContext(`${read("content-common.js").slice(start, end)}\nthis.utils = Utils;`, context);
  context.utils.ensureBody(() => {});
  assert.equal(context.utils.observers.length, 1);
  body = {};
  observers[0].callback([], observers[0]);
  assert.equal(observers[0].disconnected, true);
  assert.equal(context.utils.observers.length, 0);
});

test("Facebook Stories CSS hides recognized fixtures but leaves unrelated controls visible", () => {
  const css = read("content.css");
  const block = css.match(/body\.ft-hide-fb-stories\.ft-platform-fb[\s\S]*?\}/)?.[0] || "";
  for (const label of ["See more stories", "Next card", "Previous card"]) {
    const selector = block.split("{")[0].split(",").find((item) => item.includes(`[aria-label="${label}"]`));
    assert.ok(selector, `missing Stories fixture selector for ${label}`);
    assert.match(selector, /\[aria-label="Stories"\]|\[aria-label="Story tray"\]/);
  }
});

test("manifest and package allowlists remain narrow and internally consistent", () => {
  const chrome = readJson("chrome-manifest.json");
  const firefox = readJson("firefox-manifest.json");
  const { runtimeFiles } = require(path.join(root, "scripts", "prepare-test-builds.js"));
  assert.deepEqual(chrome.permissions.sort(), ["alarms", "notifications", "storage"]);
  assert.deepEqual(firefox.permissions.sort(), [
    "*://*.facebook.com/*", "*://*.instagram.com/*", "*://*.linkedin.com/*",
    "*://*.tiktok.com/*", "*://*.youtube.com/*", "alarms", "notifications", "storage",
  ]);
  assert.deepEqual(runtimeFiles, [
    "background.js", "content-common.js", "content-fb.js", "content-ig.js", "content-li.js",
    "content-tt.js", "content-yt.js", "content.css", "styles.css", "popup.html", "popup.js",
    "options.html", "options.js", "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
  ]);
  assert.equal(JSON.parse(read("package.json")).private, true);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} G004 test(s) failed.`);
  process.exitCode = 1;
}
