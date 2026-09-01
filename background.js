const TIMER_ALARM_NAME = "focusTubeTimer";
let statIncrementPending = 0;
let statIncrementActive = false;
const timerOperations = [];
let timerOperationActive = false;
let timerStateRevision = 0;
let settingsReplacementActive = false;
const internalEnabledValues = [];
let primaryAlarmWhen;
let completionRevision = null;
const TIMER_RETRY_LIMIT = 3;
const TIMER_RETRY_PREFIX = "focusTubeTimerRetry:";
const TIMER_COMPLETION_CLAIM = "ft_timer_completion_claim";

function retireInternalEnabledMarker(value) {
  const index = internalEnabledValues.indexOf(value);
  if (index !== -1) {
    internalEnabledValues.splice(index, 1);
  }
}

function consumeRuntimeError() {
  void chrome.runtime?.lastError;
  if (chrome.runtime) chrome.runtime.lastError = null;
}

function enqueueTimerOperation(operation) {
  timerOperations.push(operation);
  drainTimerOperations();
}

function drainTimerOperations() {
  if (timerOperationActive || timerOperations.length === 0) return;
  timerOperationActive = true;
  const operation = timerOperations.shift();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    timerOperationActive = false;
    drainTimerOperations();
  };
  try {
    operation(finish);
  } catch (error) {
    console.error("FocusTube timer operation failed", error);
    finish();
  }
}

function readTimerSnapshot(callback) {
  chrome.storage.local.get(["ft_enabled", "ft_timer_end", "ft_timer_type"], (res) => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      callback({ ok: false, snapshot: null });
      return;
    }
    callback({
      ok: true,
      snapshot: { end: res.ft_timer_end, type: res.ft_timer_type, enabled: res.ft_enabled },
    });
  });
}

function matchesTimer(snapshot, expected) {
  return Boolean(
    snapshot &&
      expected &&
      snapshot.end === expected.end &&
      snapshot.type === expected.type,
  );
}

function withCurrentTimer(expected, callback) {
  readTimerSnapshot((result) => {
    callback({
      ok: result.ok,
      matches: result.ok && timerIsEnabled(result.snapshot) &&
        matchesTimer(result.snapshot, expected) &&
        (completionRevision === null || timerStateRevision === completionRevision),
    });
  });
}

function withCurrentTimerState(expected, callback) {
  readTimerSnapshot((result) => {
    callback({
      ok: result.ok,
      matches: result.ok && matchesTimer(result.snapshot, expected) &&
        (completionRevision === null || timerStateRevision === completionRevision),
    });
  });
}

function timerIsEnabled(snapshot) {
  return snapshot && snapshot.enabled !== false;
}

function isPlainSafeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  return (
    typeof prototype.constructor === "function" &&
    prototype.constructor.name === "Object" &&
    !Object.keys(value).some(
      (key) => key === "__proto__" || key === "prototype" || key === "constructor",
    )
  );
}

function isExtensionPageSender(sender) {
  return Boolean(
    sender &&
      sender.id === chrome.runtime.id &&
      typeof sender.url === "string" &&
      sender.url.startsWith(chrome.runtime.getURL("")),
  );
}

function timerRetryName(expected, attempt) {
  const end = encodeURIComponent(String(expected.end));
  const type = encodeURIComponent(String(expected.type));
  return `${TIMER_RETRY_PREFIX}${end}:${type}:${attempt}`;
}

function parseTimerRetryName(name) {
  if (typeof name !== "string" || !name.startsWith(TIMER_RETRY_PREFIX)) return null;
  const parts = name.slice(TIMER_RETRY_PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const attempt = Number(parts[2]);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > TIMER_RETRY_LIMIT) return null;
  try {
    return { end: decodeURIComponent(parts[0]), type: decodeURIComponent(parts[1]), attempt };
  } catch (_) {
    return null;
  }
}

function scheduleTimerRetry(expected, attempt = 1) {
  if (attempt > TIMER_RETRY_LIMIT) return;
  const name = timerRetryName(expected, attempt);
  chrome.alarms.create(name, {
    when: Math.max(expected.end, Date.now() + 1000),
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("FocusTube timer retry alarm creation failed");
      consumeRuntimeError();
    }
  });
}

function createPrimaryTimerAlarm(endTime, callback = () => {}) {
  chrome.alarms.create(TIMER_ALARM_NAME, { when: endTime }, () => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      return callback(false);
    }
    const verify = (alarm) => {
      if (chrome.runtime.lastError || !alarm || alarm.scheduledTime !== endTime) {
        consumeRuntimeError();
        return callback(false);
      }
      primaryAlarmWhen = endTime;
      callback(true);
    };
    if (chrome.alarms.get) return chrome.alarms.get(TIMER_ALARM_NAME, verify);
    primaryAlarmWhen = endTime;
    callback(true);
  });
}

function snapshotPrimaryAlarm(callback) {
  if (!chrome.alarms.get) {
    return callback({ ok: true, alarm: primaryAlarmWhen === undefined ? null : { scheduledTime: primaryAlarmWhen } });
  }
  chrome.alarms.get(TIMER_ALARM_NAME, (alarm) => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      return callback({ ok: false, alarm: null });
    }
    callback({ ok: true, alarm: alarm || null });
  });
}

function restorePrimaryAlarm(alarm, callback = () => {}) {
  if (alarm && Number.isFinite(alarm.scheduledTime)) {
    return createPrimaryTimerAlarm(alarm.scheduledTime, callback);
  }
  chrome.alarms.clear(TIMER_ALARM_NAME, () => {
    const failed = Boolean(chrome.runtime.lastError);
    consumeRuntimeError();
    if (!failed) primaryAlarmWhen = undefined;
    callback(!failed);
  });
}

function readTimerTransactionSnapshot(callback) {
  chrome.storage.local.get(
    ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
    (values) => {
      if (chrome.runtime.lastError) {
        consumeRuntimeError();
        return callback({ ok: false });
      }
      snapshotPrimaryAlarm((alarmResult) => {
        if (!alarmResult.ok) return callback({ ok: false });
        callback({
          ok: true,
          values: Object.fromEntries(
            Object.entries(values).filter(([, value]) => value !== undefined),
          ),
          alarm: alarmResult.alarm,
        });
      });
    },
  );
}

function restoreTimerTransaction(snapshot, callback = () => {}) {
  const values = snapshot.values || {};
  const present = Object.keys(values);
  const restoreStorage = () => {
    const missing = ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"]
      .filter((key) => !Object.prototype.hasOwnProperty.call(values, key));
    if (missing.length === 0) return restorePrimaryAlarm(snapshot.alarm, callback);
    chrome.storage.local.remove(missing, () => {
      if (chrome.runtime.lastError) {
        consumeRuntimeError();
        return callback(false);
      }
      restorePrimaryAlarm(snapshot.alarm, callback);
    });
  };
  if (present.length === 0) return restoreStorage();
  chrome.storage.local.set(values, () => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      return callback(false);
    }
    restoreStorage();
  });
}

function completionStorageFailure(expected, operation, callback, attempt = 1) {
  consumeRuntimeError();
  console.error(`FocusTube timer ${operation} failed; retry scheduled`);
  scheduleTimerRetry(expected, attempt);
  callback();
}

function timerCompletionClaimValue(expected) {
  return `${String(expected.end)}:${String(expected.type)}`;
}

function claimTimerCompletion(expected, callback) {
  const claim = timerCompletionClaimValue(expected);
  chrome.storage.local.get([TIMER_COMPLETION_CLAIM], (values) => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      return callback({ ok: false, owned: false });
    }
    if (values[TIMER_COMPLETION_CLAIM] === claim) return callback({ ok: true, owned: false });
    chrome.storage.local.set({ [TIMER_COMPLETION_CLAIM]: claim }, () => {
      if (chrome.runtime.lastError) {
        consumeRuntimeError();
        return callback({ ok: false, owned: false });
      }
      callback({ ok: true, owned: true });
    });
  });
}

function clearTimerCompletionClaim(callback) {
  chrome.storage.local.remove(TIMER_COMPLETION_CLAIM, () => {
    const failed = Boolean(chrome.runtime.lastError);
    consumeRuntimeError();
    callback(!failed);
  });
}

function writeTimerStorage(expected, values, operation, callback, attempt = 1, storageFailureExpected = expected) {
  chrome.storage.local.set(values, () => {
    if (chrome.runtime.lastError) {
      return completionStorageFailure(storageFailureExpected, operation, callback, attempt);
    }
    createPrimaryTimerAlarm(values.ft_timer_end, (ok) => {
      if (!ok) {
        console.error(`FocusTube timer ${operation} alarm creation failed; retry scheduled`);
        scheduleTimerRetry(expected, attempt);
      }
      callback(true);
    });
  });
}

function reconcilePersistedTimer(cleanExpired = false, callback = () => {}) {
  readTimerSnapshot((result) => {
    if (!result.ok) return callback(false);
    const snapshot = result.snapshot;
    if (!snapshot.end) {
      chrome.alarms.clear(TIMER_ALARM_NAME, () => {
        const failed = Boolean(chrome.runtime.lastError);
        consumeRuntimeError();
        if (!failed) primaryAlarmWhen = undefined;
        callback(!failed, failed ? "alarm_clear_failed" : undefined);
      });
      return;
    }
    if (snapshot.end <= Date.now()) {
      if (!cleanExpired) return callback(true);
      const revision = timerStateRevision;
      const snapshotEnabled = timerIsEnabled(snapshot);
      const reconcileExpiredTimer = (alarm) => {
        readTimerSnapshot((currentResult) => {
          if (!currentResult.ok) return callback(true);
          const currentSnapshot = currentResult.snapshot;
          const currentEnabled = timerIsEnabled(currentSnapshot);
          if (
            timerStateRevision !== revision ||
            !matchesTimer(currentSnapshot, snapshot) ||
            currentEnabled !== snapshotEnabled
          ) {
            return callback(true);
          }
          const hasMatchingAlarm = alarm && alarm.scheduledTime === currentSnapshot.end;
          if (hasMatchingAlarm && currentEnabled) {
            return completeTimer(currentSnapshot, () => callback(true), 0);
          }
          if (!hasMatchingAlarm) {
            return withCurrentTimerState(currentSnapshot, (current) => {
              if (!current.ok || !current.matches) return callback(true);
              chrome.storage.local.remove(
                ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
                () => {
                  const failed = Boolean(chrome.runtime.lastError);
                  consumeRuntimeError();
                  callback(!failed, failed ? "alarm_clear_failed" : undefined);
                },
              );
            });
          }
          withCurrentTimerState(currentSnapshot, (matches) => {
            if (!matches.ok || !matches.matches) return callback(true);
            chrome.storage.local.remove(
              ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
              () => {
                if (chrome.runtime.lastError) {
                  consumeRuntimeError();
                  return callback(false);
                }
                chrome.alarms.clear(TIMER_ALARM_NAME, () => {
                  const failed = Boolean(chrome.runtime.lastError);
                  consumeRuntimeError();
                  if (!failed) primaryAlarmWhen = undefined;
                  callback(!failed);
                });
              },
            );
          });
        });
      };
      if (chrome.alarms.get) {
        return chrome.alarms.get(TIMER_ALARM_NAME, (alarm) => {
          if (chrome.runtime.lastError) {
            consumeRuntimeError();
            return callback(true);
          }
          consumeRuntimeError();
          reconcileExpiredTimer(alarm);
        });
      }
      reconcileExpiredTimer(
        primaryAlarmWhen === snapshot.end
          ? { scheduledTime: primaryAlarmWhen }
          : null,
      );
      return;
    }
    createPrimaryTimerAlarm(snapshot.end, (ok) => {
      if (!ok) {
        console.error("FocusTube timer startup alarm recreation failed; retry scheduled");
        scheduleTimerRetry({ end: snapshot.end, type: snapshot.type }, 1);
      }
      callback(ok);
    });
  });
}

function replaceSettingsTransaction(existing, priorAlarm, settings, sendResponse, done) {
  const obsoleteKeys = Object.keys(existing).filter(
    (key) => !Object.prototype.hasOwnProperty.call(settings, key),
  );
  const introducedKeys = Object.keys(settings).filter(
    (key) => !Object.prototype.hasOwnProperty.call(existing, key),
  );
  const existingValues = Object.fromEntries(
    Object.keys(settings)
      .filter((key) => Object.prototype.hasOwnProperty.call(existing, key))
      .map((key) => [key, settings[key]]),
  );
  const finishFailure = (error) => {
    retireInternalEnabledMarker(false);
    settingsReplacementActive = false;
    sendResponse({ replaced: false, error });
    done();
  };
  const finishRollbackFailure = () => {
    restorePrimaryAlarm(priorAlarm, () => finishFailure("storage_rollback_failed"));
  };
  const rollback = (error) => {
    chrome.storage.local.set(existing, () => {
      const restoreFailed = Boolean(chrome.runtime.lastError);
      consumeRuntimeError();
      if (restoreFailed) return finishRollbackFailure();
      const restorePriorAlarm = () => restorePrimaryAlarm(priorAlarm, (ok) => {
        if (!ok) return finishRollbackFailure();
        finishFailure(error);
      });
      if (error === "storage_remove_failed") return restorePriorAlarm();
      const removeIntroduced = () => {
        if (introducedKeys.length === 0) return restorePriorAlarm();
        chrome.storage.local.remove(introducedKeys, () => {
          const removeFailed = Boolean(chrome.runtime.lastError);
          consumeRuntimeError();
          if (removeFailed) return finishRollbackFailure();
          restorePriorAlarm();
        });
      };
      removeIntroduced();
    });
  };
  const finishReplacement = () => {
    reconcilePersistedTimer(true, (ok, error) => {
      if (!ok) return rollback(error || "alarm_create_failed");
      retireInternalEnabledMarker(false);
      settingsReplacementActive = false;
      sendResponse({ replaced: true });
      done();
    });
  };
  const writeIntroduced = () => {
    if (introducedKeys.length === 0) return finishReplacement();
    chrome.storage.local.set(
      Object.fromEntries(introducedKeys.map((key) => [key, settings[key]])),
      () => {
        if (chrome.runtime.lastError) {
          consumeRuntimeError();
          return rollback("storage_set_failed");
        }
        finishReplacement();
      },
    );
  };
  const removeObsolete = () => {
    if (obsoleteKeys.length === 0) return writeIntroduced();
    chrome.storage.local.remove(obsoleteKeys, () => {
      if (chrome.runtime.lastError) {
        consumeRuntimeError();
        return rollback("storage_remove_failed");
      }
      writeIntroduced();
    });
  };
  if (Object.keys(existingValues).length === 0) return removeObsolete();
  chrome.storage.local.set(existingValues, () => {
    if (chrome.runtime.lastError) {
      consumeRuntimeError();
      return rollback("storage_set_failed");
    }
    removeObsolete();
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.ft_timer_end || changes.ft_timer_type || changes.ft_enabled) {
    timerStateRevision += 1;
  }
  const isInternalEnabledChange = Boolean(
    changes.ft_enabled &&
    ((internalEnabledValues[0] === changes.ft_enabled.newValue &&
      internalEnabledValues.shift() !== undefined)),
  );
  if (
    !settingsReplacementActive &&
    !isInternalEnabledChange &&
    changes.ft_enabled &&
    changes.ft_enabled.newValue === false
  ) {
    const disableRevision = timerStateRevision;
    enqueueTimerOperation((done) => {
      chrome.storage.local.get(["ft_enabled"], (res) => {
        if (chrome.runtime.lastError || res.ft_enabled !== false) {
          consumeRuntimeError();
          return done();
        }
        chrome.storage.local.get(
          ["ft_enabled", "ft_timer_end", "ft_timer_type"],
          (latest) => {
            if (chrome.runtime.lastError || latest.ft_enabled !== false) {
              consumeRuntimeError();
              return done();
            }
            const expected = {
              end: latest.ft_timer_end,
              type: latest.ft_timer_type,
            };
            if (!expected.end) {
              chrome.alarms.clear(TIMER_ALARM_NAME, () => {
                const failed = Boolean(chrome.runtime.lastError);
                consumeRuntimeError();
                if (!failed) primaryAlarmWhen = undefined;
                done();
              });
              return;
            }
            withCurrentTimerState(expected, (current) => {
              if (
                !current.ok ||
                !current.matches ||
                timerStateRevision !== disableRevision
              ) {
                return done();
              }
              chrome.storage.local.remove(
                ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
                () => {
                  if (chrome.runtime.lastError) {
                    consumeRuntimeError();
                    return done();
                  }
                  chrome.alarms.clear(TIMER_ALARM_NAME, () => {
                    const failed = Boolean(chrome.runtime.lastError);
                    consumeRuntimeError();
                    if (!failed) primaryAlarmWhen = undefined;
                    done();
                  });
                },
              );
            });
          },
        );
      });
    });
  }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (typeof request === "string") {
    try {
      request = JSON.parse(request);
    } catch (_) {
      return false;
    }
  }
  if (request.action === "incrementStat") {
    const amount = Math.max(1, Number(request.amount) || 1);
    statIncrementPending += amount;
    flushStatIncrements();
    return false;
  }
  if (request.action === "startTimer") {
    const duration = parseInt(request.duration) || 25;
    const type = request.type || "work";
    const endTime = Date.now() + duration * 60 * 1000;
    enqueueTimerOperation((done) => {
      readTimerTransactionSnapshot((snapshot) => {
        if (!snapshot.ok) {
          sendResponse({ started: false, error: "storage_read_failed" });
          return done();
        }
        const fail = (error) => restoreTimerTransaction(snapshot, (restored) => {
          sendResponse({ started: false, error: restored ? error : "storage_rollback_failed" });
          done();
        });
        chrome.storage.local.remove("ft_work_session_ended", () => {
          if (chrome.runtime.lastError) {
            consumeRuntimeError();
            sendResponse({ started: false, error: "storage_remove_failed" });
            return done();
          }
          chrome.storage.local.set(
            { ft_timer_end: endTime, ft_timer_type: type },
            () => {
              if (chrome.runtime.lastError) {
                consumeRuntimeError();
                return fail("storage_set_failed");
              }
              createPrimaryTimerAlarm(endTime, (ok) => {
                if (!ok) return fail("alarm_create_failed");
                sendResponse({ end: endTime });
                done();
              });
            },
          );
        });
      });
    });
    return true;
  }
  if (request.action === "setExtensionEnabled") {
    const enabled = request.enabled !== false;
    enqueueTimerOperation((done) => {
      chrome.storage.local.get(["ft_enabled"], (before) => {
        if (chrome.runtime.lastError) {
          consumeRuntimeError();
          sendResponse({ enabled: false, error: "storage_read_failed" });
          return done();
        }
        if (before.ft_enabled !== enabled) internalEnabledValues.push(enabled);
        chrome.storage.local.set({ ft_enabled: enabled }, () => {
          if (chrome.runtime.lastError) {
            consumeRuntimeError();
            retireInternalEnabledMarker(enabled);
            sendResponse({ enabled: false, error: "storage_set_failed" });
            return done();
          }
          chrome.storage.local.get(["ft_enabled"], (state) => {
            if (chrome.runtime.lastError || state.ft_enabled !== enabled) {
              consumeRuntimeError();
              retireInternalEnabledMarker(enabled);
              sendResponse({ enabled: false, error: "storage_read_failed" });
              return done();
            }
            if (enabled) {
              retireInternalEnabledMarker(enabled);
              sendResponse({ enabled: true });
              return done();
            }
            chrome.storage.local.get(["ft_enabled"], (latest) => {
              if (chrome.runtime.lastError || latest.ft_enabled !== false) {
                consumeRuntimeError();
                retireInternalEnabledMarker(enabled);
                sendResponse({ enabled: false, error: "storage_read_failed" });
                return done();
              }
              chrome.storage.local.remove(
                ["ft_timer_end", "ft_timer_type", "ft_work_session_ended"],
                () => {
                  if (chrome.runtime.lastError) {
                    consumeRuntimeError();
                    retireInternalEnabledMarker(enabled);
                    sendResponse({ enabled: false, error: "storage_remove_failed" });
                    return done();
                  }
                  chrome.alarms.clear(TIMER_ALARM_NAME, () => {
                    const failed = Boolean(chrome.runtime.lastError);
                    consumeRuntimeError();
                    retireInternalEnabledMarker(enabled);
                    if (!failed) primaryAlarmWhen = undefined;
                    sendResponse(failed ? { enabled: false, error: "alarm_clear_failed" } : { enabled: false });
                    done();
                  });
                },
              );
            });
          });
        });
      });
    });
    return true;
  }
  if (request.action === "dismissEndedPrompt") {
    enqueueTimerOperation((done) => {
      chrome.storage.local.remove("ft_work_session_ended", () => {
        const failed = Boolean(chrome.runtime.lastError);
        consumeRuntimeError();
        sendResponse(failed
          ? { dismissed: false, error: "storage_remove_failed" }
          : { dismissed: true });
        done();
      });
    });
    return true;
  }
  if (request.action === "replaceSettings") {
    if (!(request.settings && typeof request.settings === "object")) return false;
    if (!isExtensionPageSender(sender) || !isPlainSafeObject(request.settings)) return false;
    enqueueTimerOperation((done) => {
      settingsReplacementActive = true;
      if (request.settings.ft_enabled === false) {
        request.settings = { ...request.settings };
        delete request.settings.ft_timer_end;
        delete request.settings.ft_timer_type;
        delete request.settings.ft_work_session_ended;
      }
      chrome.storage.local.get(null, (existing) => {
        if (chrome.runtime.lastError || !existing || typeof existing !== "object") {
          consumeRuntimeError();
          retireInternalEnabledMarker(false);
          settingsReplacementActive = false;
          sendResponse({ replaced: false, error: "storage_read_failed" });
          return done();
        }
        if (request.settings.ft_enabled === false && existing.ft_enabled !== false) {
          internalEnabledValues.push(false);
        }
        snapshotPrimaryAlarm((alarmResult) => {
          if (!alarmResult.ok) {
            retireInternalEnabledMarker(false);
            settingsReplacementActive = false;
            sendResponse({ replaced: false, error: "alarm_read_failed" });
            return done();
          }
          replaceSettingsTransaction(existing, alarmResult.alarm, request.settings, sendResponse, done);
        });
      });
    });
    return true;
  }
  if (request.action === "stopTimer") {
    enqueueTimerOperation((done) => {
      readTimerTransactionSnapshot((transaction) => {
        if (!transaction.ok) {
          sendResponse({ stopped: false, error: "storage_read_failed" });
          return done();
        }
        const snapshot = {
          end: transaction.values.ft_timer_end,
          type: transaction.values.ft_timer_type,
        };
        const revision = timerStateRevision;
        withCurrentTimer(snapshot, (stillCurrent) => {
          if (!stillCurrent.ok) {
            sendResponse({ stopped: false, error: "storage_read_failed" });
            return done();
          }
          if (!stillCurrent.matches || timerStateRevision !== revision) {
            sendResponse({ stopped: false, error: "timer_changed" });
            return done();
          }
          chrome.storage.local.remove(["ft_timer_end", "ft_timer_type"], () => {
            if (chrome.runtime.lastError) {
              consumeRuntimeError();
              sendResponse({ stopped: false, error: "storage_remove_failed" });
              done();
              return;
            }
            chrome.alarms.clear(TIMER_ALARM_NAME, () => {
              if (chrome.runtime.lastError) {
                consumeRuntimeError();
                restoreTimerTransaction(transaction, (restored) => {
                  sendResponse({
                    stopped: false,
                    error: restored ? "alarm_clear_failed" : "storage_rollback_failed",
                  });
                  done();
                });
                return;
              }
              primaryAlarmWhen = undefined;
              sendResponse({ stopped: true });
              done();
            });
          });
        });
      });
    });
    return true;
  }
  if (request.action === "startBreak") {
    const duration = parseInt(request.duration) || 5;
    const endTime = Date.now() + duration * 60 * 1000;
    enqueueTimerOperation((done) => {
      readTimerTransactionSnapshot((snapshot) => {
        if (!snapshot.ok) {
          sendResponse({ started: false, error: "storage_read_failed" });
          return done();
        }
        const fail = (error) => restoreTimerTransaction(snapshot, (restored) => {
          sendResponse({ started: false, error: restored ? error : "storage_rollback_failed" });
          done();
        });
        chrome.storage.local.remove("ft_work_session_ended", () => {
          if (chrome.runtime.lastError) {
            consumeRuntimeError();
            sendResponse({ started: false, error: "storage_remove_failed" });
            return done();
          }
          chrome.storage.local.set(
            { ft_timer_end: endTime, ft_timer_type: "break" },
            () => {
              if (chrome.runtime.lastError) {
                consumeRuntimeError();
                return fail("storage_set_failed");
              }
              createPrimaryTimerAlarm(endTime, (ok) => {
                if (!ok) return fail("alarm_create_failed");
                sendResponse({ end: endTime });
                done();
              });
            },
          );
        });
      });
    });
    return true;
  }
});
function flushStatIncrements() {
  if (statIncrementActive) return;
  if (statIncrementPending <= 0) return;
  statIncrementActive = true;
  const delta = statIncrementPending;
  statIncrementPending = 0;
  chrome.storage.local.get(["ft_stats_blocked"], (res) => {
    if (chrome.runtime.lastError) {
      statIncrementPending += delta;
      statIncrementActive = false;
      return;
    }
    const current = Number(res.ft_stats_blocked) || 0;
    chrome.storage.local.set({ ft_stats_blocked: current + delta }, () => {
      const writeFailed = Boolean(chrome.runtime.lastError);
      if (writeFailed) {
        statIncrementPending += delta;
      }
      statIncrementActive = false;
      if (!writeFailed && statIncrementPending > 0) flushStatIncrements();
    });
  });
}
function notifyIfCurrent(expected, title, msg, callback, suppress = false) {
  withCurrentTimer(expected, (matches) => {
    if (!matches.ok) return callback(false, "storage");
    if (!matches.matches) return callback(false, "changed");
    if (suppress) return callback(true);
    chrome.storage.local.get(["showNotifications"], (res) => {
      if (chrome.runtime.lastError) {
        consumeRuntimeError();
        console.error("FocusTube timer notification preference read failed; retry scheduled");
        scheduleTimerRetry({ end: expected.end, type: expected.type }, 1);
        return callback(true);
      }
      if (res.showNotifications === false) {
        return callback(true);
      }
      if (!chrome.notifications || !chrome.notifications.create) {
        return callback(true);
      }
      withCurrentTimer(expected, (stillCurrent) => {
        if (!stillCurrent.ok) return callback(false, "storage");
        if (!stillCurrent.matches) return callback(false, "changed");
        chrome.notifications.create(
          "focustube-" + Date.now(),
          {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon128.png"),
            title,
            message: msg,
            priority: 2,
          },
          () => {
            consumeRuntimeError();
            callback(true);
          },
        );
      });
    });
  });
}

function completeTimer(expected, done, retryAttempt = 0, completionClaimOwned = null) {
  if (completionClaimOwned === null) {
    return claimTimerCompletion(expected, (claim) => {
      if (!claim.ok) {
        return completionStorageFailure(expected, "completion claim", done, retryAttempt + 1);
      }
      completeTimer(expected, done, retryAttempt, claim.owned);
    });
  }
  const revision = timerStateRevision;
  completionRevision = revision;
  const originalDone = done;
  done = () => {
    if (completionRevision === revision) completionRevision = null;
    originalDone();
  };
  readTimerSnapshot((result) => {
    if (!result.ok) {
      return completionStorageFailure(expected, "timer read", done, retryAttempt + 1);
    }
    if (!matchesTimer(result.snapshot, expected)) {
      return clearTimerCompletionClaim(() => done());
    }
    chrome.storage.local.get(["breakDuration", "autoStartBreaks"], (res) => {
      if (chrome.runtime.lastError) {
        return completionStorageFailure(expected, "settings read", done, retryAttempt + 1);
      }
      const isWork = expected.type === "work";
      const breakTime = parseInt(res.breakDuration) || 5;
      const autoStart = res.autoStartBreaks !== false;
      const title = isWork ? "Focus Timer Complete! \u{1F389}" : "Break Over! \u{23F0}";
      let msg = "Back to work. Distractions blocked.";
      if (isWork) {
        msg = autoStart
          ? `Time for a ${breakTime}-minute break.`
          : "Focus session complete.";
      }
      const notify = (callback) => {
        if (!completionClaimOwned) {
          callback(true);
          return;
        }
        notifyIfCurrent(expected, title, msg, callback);
      };
      notify((notificationAllowed, reason) => {
        if (!notificationAllowed) {
          if (reason === "storage") {
            return completionStorageFailure(expected, "notification read", done, retryAttempt + 1);
          }
          return done();
        }
        withCurrentTimer(expected, (stillCurrent) => {
          if (!stillCurrent.ok) {
            return completionStorageFailure(expected, "completion read", done, retryAttempt + 1);
          }
          if (!stillCurrent.matches) return done();
          const sendCompletionMessages = () => {
            const transition = () => {
              withCurrentTimer(expected, (current) => {
                if (!current.ok) {
                  return completionStorageFailure(expected, "transition read", done, retryAttempt + 1);
                }
                if (!current.matches) {
                  return done();
                }
                if (isWork && !autoStart) {
                  chrome.storage.local.set({ ft_work_session_ended: true }, () => {
                    if (chrome.runtime.lastError) {
                      return completionStorageFailure(
                        expected,
                        "marker write",
                        done,
                        retryAttempt + 1,
                      );
                    }
                    withCurrentTimer(expected, (stillCurrent) => {
                      if (!stillCurrent.ok) {
                        return completionStorageFailure(
                          expected,
                          "marker validation read",
                          done,
                          retryAttempt + 1,
                        );
                      }
                      if (!stillCurrent.matches) return done();
                      chrome.storage.local.remove(["ft_timer_end", "ft_timer_type", TIMER_COMPLETION_CLAIM], () => {
                        if (chrome.runtime.lastError) {
                          return completionStorageFailure(
                            expected,
                            "timer removal",
                            done,
                            retryAttempt + 1,
                          );
                        }
                        done();
                      });
                    });
                  });
                  return;
                }
                if (isWork) {
                  const breakExpected = {
                    end: Date.now() + breakTime * 60 * 1000,
                    type: "break",
                  };
                  writeTimerStorage(
                    breakExpected,
                    {
                      ft_timer_end: breakExpected.end,
                      ft_timer_type: breakExpected.type,
                    },
                    "break transition",
                    (ok) => {
                      if (!ok) return done();
                      clearTimerCompletionClaim(() => done());
                    },
                    retryAttempt + 1,
                    expected,
                  );
                } else {
                  chrome.storage.local.remove(["ft_timer_end", "ft_timer_type", TIMER_COMPLETION_CLAIM], () => {
                    if (chrome.runtime.lastError) {
                      return completionStorageFailure(
                        expected,
                        "timer removal",
                        done,
                        retryAttempt + 1,
                      );
                    }
                    done();
                  });
                }
              });
            };
            if (!completionClaimOwned) return transition();
            chrome.tabs.query(
              {
                url: [
                  "*://*.youtube.com/*",
                  "*://*.instagram.com/*",
                  "*://*.tiktok.com/*",
                  "*://*.facebook.com/*",
                  "*://*.linkedin.com/*",
                ],
              },
              (tabs) => {
                if (chrome.runtime.lastError || tabs === undefined) {
                  consumeRuntimeError();
                  return transition();
                }
                const matchingTabs = Array.isArray(tabs) ? tabs : [];
                const sendNextTab = (index) => {
                  if (index >= matchingTabs.length) return transition();
                  const tab = matchingTabs[index];
                  if (!tab || tab.id === undefined) return sendNextTab(index + 1);
                  withCurrentTimer(expected, (current) => {
                    if (!current.ok) {
                      return completionStorageFailure(
                        expected,
                        "tab validation read",
                        done,
                        retryAttempt + 1,
                      );
                    }
                    if (!current.matches) return done();
                    chrome.tabs.sendMessage(
                      tab.id,
                      {
                        action: "TIMER_COMPLETE",
                        target: "content",
                        type: expected.type,
                        breakDuration: breakTime,
                      },
                      () => {
                        consumeRuntimeError();
                        sendNextTab(index + 1);
                      },
                    );
                  });
                };
                sendNextTab(0);
              },
            );
          };
          if (!completionClaimOwned) return sendCompletionMessages();
          chrome.runtime.sendMessage(
            {
              action: "TIMER_COMPLETE",
              target: "extension",
              type: expected.type,
              breakDuration: breakTime,
            },
            () => {
              consumeRuntimeError();
              sendCompletionMessages();
            },
          );
        });
      }, retryAttempt > 0);
    });
  });
}

const onAlarmHandler = (alarm) => {
  enqueueTimerOperation((done) => {
    const retry = parseTimerRetryName(alarm && alarm.name);
    if (!alarm || (alarm.name !== TIMER_ALARM_NAME && !retry)) return done();
    readTimerSnapshot((result) => {
      if (!result.ok) {
        if (!retry) console.error("FocusTube timer alarm snapshot unavailable; reconciliation deferred");
        return done();
      }
      if (!result.snapshot.end) return done();
      if (retry) {
        if (
          String(result.snapshot.end) !== retry.end ||
          String(result.snapshot.type) !== retry.type
        ) return done();
      } else if (alarm.scheduledTime !== result.snapshot.end) {
        return done();
      }
      completeTimer(result.snapshot, done, retry ? retry.attempt : 0);
    });
  });
};
chrome.alarms.onAlarm.addListener(onAlarmHandler);
chrome.runtime.onStartup.addListener(() => {
  enqueueTimerOperation((done) => reconcilePersistedTimer(true, done));
});
enqueueTimerOperation((done) => reconcilePersistedTimer(false, done));
