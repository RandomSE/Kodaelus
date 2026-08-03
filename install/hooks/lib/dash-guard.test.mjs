import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreToolDenyAgentMessage,
  buildStopFollowupMessage,
  containsUnicodeDash,
  countUnicodeDashes,
  findUnicodeDashViolations,
  replaceUnicodeDashes,
  truncateMessage,
  UNICODE_DASH_RE,
} from "./dash-guard.mjs";

const EM = "\u2014";
const EN = "\u2013";

test("containsUnicodeDash detects em and en dash", () => {
  assert.equal(containsUnicodeDash(`hello${EM}world`), true);
  assert.equal(containsUnicodeDash(`hello${EN}world`), true);
  assert.equal(containsUnicodeDash("hello-world"), false);
});

test("countUnicodeDashes counts both dash types", () => {
  assert.equal(countUnicodeDashes(`a${EM}b${EN}c`), 2);
  assert.equal(countUnicodeDashes(`${EM}${EM}${EM}`), 3);
});

test("findUnicodeDashViolations returns limited snippets", () => {
  const text = `alpha${EM}beta${EN}gamma`;
  const violations = findUnicodeDashViolations(text, 1);
  assert.equal(violations.length, 1);
  assert.match(violations[0].snippet, /alpha/);
  assert.ok(UNICODE_DASH_RE.test(violations[0].char));
});

test("replaceUnicodeDashes leaves clean text unchanged", () => {
  assert.equal(replaceUnicodeDashes("plain text"), "plain text");
});

test("replaceUnicodeDashes clause before lowercase becomes comma", () => {
  assert.equal(
    replaceUnicodeDashes(`The feature${EM} which is new${EM} works`),
    "The feature, which is new, works",
  );
});

test("replaceUnicodeDashes clause before uppercase becomes semicolon", () => {
  const result = replaceUnicodeDashes(`We shipped${EN} The release is live`);
  assert.match(result, /; The release is live$/);
});

test("replaceUnicodeDashes numeric range uses hyphen", () => {
  assert.equal(replaceUnicodeDashes(`2020${EN}2025`), "2020 - 2025");
  assert.equal(replaceUnicodeDashes(`2020${EM}2025`), "2020 - 2025");
});

test("replaceUnicodeDashes collapses long dash runs", () => {
  assert.equal(replaceUnicodeDashes(`${EM.repeat(10)}`), ", ");
  assert.equal(replaceUnicodeDashes(`${EN.repeat(6)}`), ", ");
});

test("replaceUnicodeDashes dual parenthetical", () => {
  assert.equal(
    replaceUnicodeDashes(`The feature${EM} which is new${EM} works well`),
    "The feature, which is new, works well",
  );
});

test("replaceUnicodeDashes line-start list marker", () => {
  assert.equal(replaceUnicodeDashes(`${EN} item one`), "- item one");
  assert.equal(replaceUnicodeDashes(`  ${EM} item two`), "  - item two");
});

test("replaceUnicodeDashes skipCode preserves fenced and inline code", () => {
  const input = `Prose ${EM} here\n\`\`\`js\nconst x = "${EM}";\n\`\`\`\nMore ${EN} text`;
  const result = replaceUnicodeDashes(input, { skipCode: true });
  assert.match(result, /Prose, here/);
  assert.match(result, new RegExp(`const x = "${EM}"`));
  assert.match(result, /More, text/);
});

test("buildPreToolDenyAgentMessage mentions count", () => {
  const violations = findUnicodeDashViolations(`bad${EM}text`, 3);
  const msg = buildPreToolDenyAgentMessage(1, violations);
  assert.match(msg, /1 unicode dash/);
  assert.match(msg, /Retry the edit/);
});

test("buildStopFollowupMessage stays under budget for long delivery", () => {
  const text = `${"word ".repeat(200)}${EM}${" tail ".repeat(50)}`;
  const violations = findUnicodeDashViolations(text, 3);
  const msg = buildStopFollowupMessage({
    count: countUnicodeDashes(text),
    violations,
    artifactPath: ".kodaelus/dash-guard/conv-fix.md",
    loopCount: 0,
  });
  assert.ok(msg.length <= 800);
  assert.match(msg, /unicode dash/);
});

test("buildStopFollowupMessage shortens on loop retry", () => {
  const msg = buildStopFollowupMessage({
    count: 2,
    violations: [],
    loopCount: 1,
  });
  assert.match(msg, /remain/);
  assert.doesNotMatch(msg, /Sanitized reference/);
});

test("truncateMessage adds ellipsis when needed", () => {
  assert.equal(truncateMessage("short", 10), "short");
  const long = "a".repeat(20);
  assert.equal(truncateMessage(long, 10).length, 10);
  assert.match(truncateMessage(long, 10), /…$/);
});
