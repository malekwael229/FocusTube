"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assessPausedMedia } = require("./site-checks");

const sample = (elapsed, paused, readyState, time = 0) => ({
  elapsed,
  videos: [{ id: 1, paused, readyState, time }],
});

test("unloaded video with paused=false is not evidence of playback", () => {
  assert.deepEqual(assessPausedMedia([
    sample(0, false, 0), sample(800, false, 0), sample(1600, false, 0),
  ]), { observedVideos: 1, playable: false, playing: false, longestUnpausedMs: 0 });
});

test("loaded video is safe when paused or briefly unpaused before the lock sweep", () => {
  const result = assessPausedMedia([
    sample(0, true, 2), sample(100, false, 2), sample(300, false, 2), sample(400, true, 2),
  ]);
  assert.equal(result.playable, true);
  assert.equal(result.playing, false);
  assert.equal(result.longestUnpausedMs, 200);
});

test("loaded video advancing under warning is playback", () => {
  const result = assessPausedMedia([
    sample(0, false, 2, 0), sample(100, false, 2, 0.03), sample(200, false, 2, 0.11),
  ]);
  assert.equal(result.playing, true);
});

test("loaded video left unpaused beyond two lock sweeps fails even when stalled", () => {
  const result = assessPausedMedia([
    sample(0, false, 2), sample(750, false, 2),
  ]);
  assert.equal(result.playing, true);
  assert.equal(result.longestUnpausedMs, 750);
});
