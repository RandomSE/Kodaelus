import assert from "node:assert/strict";
import test from "node:test";
import { detectKodaelusMode } from "./kodaelus-mode.mjs";
import { recommendCeremony, recommendKodaelusIntent } from "./intent-router.mjs";

const samples = [
  ["please implement the login form", "main", /use kodaelus main/],
  ["investigate why login fails and do not patch yet", "bug", /use kodaelus bug/],
  ["prepare this branch for commit", "prepare", /use kodaelus prepare/],
  ["ship this branch and open a pull request", "ship", /use kodaelus ship/],
  ["explain how session lock works", "question", /use kodaelus question/],
  ["what should we build next", "suggest", /use kodaelus suggest/],
];

test("natural-language samples recommend a mode and do not activate", () => {
  for (const [prompt, mode, activation] of samples) {
    assert.equal(detectKodaelusMode(prompt), null, prompt);
    const rec = recommendKodaelusIntent(prompt);
    assert.equal(rec.mode, mode, prompt);
    assert.match(rec.activation, activation, prompt);
    assert.equal(rec.switchesMode, false, prompt);
    assert.match(rec.line, activation, prompt);
    assert.match(rec.line, /does not switch mode/i, prompt);
  }
});

test("display names stay Planner / Prompt and Mode Lite", () => {
  const spec = recommendKodaelusIntent("write a paste-ready spec for the login form");
  assert.equal(spec.mode, "prompt");
  assert.match(spec.line, /Planner \/ Prompt/);
  assert.match(spec.activation, /use kodaelus prompt/);

  const tiny = recommendKodaelusIntent("fix the typo in one file");
  assert.equal(tiny.mode, "lite");
  assert.match(tiny.line, /Mode Lite/);
  assert.doesNotMatch(tiny.line, /Delivery Tier Lite is Mode Lite/);
});

test("recommendCeremony picks Lite or Standard without switching mode", () => {
  const docs = recommendCeremony("docs-only typo in the README, single file");
  assert.equal(docs.tier, "lite");
  assert.equal(docs.modeHint, "lite");
  assert.equal(docs.switchesMode, false);
  assert.match(docs.line, /Mode Lite/);
  assert.match(docs.line, /Delivery Tier Lite/);

  const small = recommendCeremony("small change across 3 files with tests");
  assert.equal(small.tier, "standard");
  assert.equal(small.switchesMode, false);
  assert.match(small.line, /Delivery Tier Standard/);

  const feature = recommendCeremony("implement a new authentication module and its tests");
  assert.equal(feature.tier, "full");
  assert.equal(feature.switchesMode, false);
});
