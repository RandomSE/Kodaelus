import assert from "node:assert/strict";
import test from "node:test";
import {
  ASK_QUESTION_HOOK_FAIL_CLOSED_READY,
  buildDenyPayload,
  buildStopFollowupMessage,
  detectOpenClarification,
  isAskQuestionToolName,
  shouldDenyAskQuestion,
} from "./ask-question-guard.mjs";

test("isAskQuestionToolName matches AskQuestion variants", () => {
  assert.equal(isAskQuestionToolName("AskQuestion"), true);
  assert.equal(isAskQuestionToolName("ask_question"), true);
  assert.equal(isAskQuestionToolName("AskUserQuestion"), true);
  assert.equal(isAskQuestionToolName("ask-user-question"), true);
  assert.equal(isAskQuestionToolName("ASKQUESTION"), true);
  assert.equal(isAskQuestionToolName("Write"), false);
  assert.equal(isAskQuestionToolName("Shell"), false);
  assert.equal(isAskQuestionToolName(""), false);
});

test("shouldDenyAskQuestion only for mutating modes", () => {
  assert.equal(shouldDenyAskQuestion("main"), true);
  assert.equal(shouldDenyAskQuestion("lite"), true);
  assert.equal(shouldDenyAskQuestion("bug"), true);
  assert.equal(shouldDenyAskQuestion("prepare"), true);
  assert.equal(shouldDenyAskQuestion("prompt"), false);
  assert.equal(shouldDenyAskQuestion("suggest"), false);
  assert.equal(shouldDenyAskQuestion("question"), false);
  assert.equal(shouldDenyAskQuestion(null), false);
  assert.equal(shouldDenyAskQuestion(""), false);
});

test("buildDenyPayload denies with resolution priority agent_message", () => {
  const payload = buildDenyPayload();
  assert.equal(payload.permission, "deny");
  assert.match(payload.user_message, /AskQuestion/i);
  assert.match(payload.agent_message, /resolution priority/i);
  assert.match(payload.agent_message, /Confidence:/);
  assert.match(payload.agent_message, /do not re-ask/i);
});

test("ASK_QUESTION_HOOK_FAIL_CLOSED_READY stays false until Cursor confirms", () => {
  assert.equal(ASK_QUESTION_HOOK_FAIL_CLOSED_READY, false);
});

test("detectOpenClarification matches waiting-on-user prose", () => {
  assert.equal(
    detectOpenClarification("Which option should I pick for the scope?"),
    true,
  );
  assert.equal(
    detectOpenClarification("Please choose one of the following."),
    true,
  );
  assert.equal(
    detectOpenClarification("Reply with yes or no to continue?"),
    true,
  );
  assert.equal(
    detectOpenClarification("Should I update all modes or only mode A?"),
    true,
  );
  assert.equal(
    detectOpenClarification(
      "Pick one:\nA) Expand scope\nB) Keep minimal\nC) Abort",
    ),
    true,
  );
});

test("detectOpenClarification prefers precision over recall", () => {
  assert.equal(
    detectOpenClarification("## Plan\nTouch about 10 files under install/."),
    false,
  );
  assert.equal(
    detectOpenClarification("Status: tests passed. Outcome Validation: Pass."),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "Ambiguity pre-emption listed decisions already answered in the prompt.",
    ),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "User may reply with scope approved when hooks block further edits.",
    ),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "Which option was already selected in Ambiguity pre-emption: minimal scope.",
    ),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "Narrative: the suite should include regression coverage for mode A.",
    ),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "Bare A/B without intro:\nA) Expand\nB) Keep minimal",
    ),
    false,
  );
  assert.equal(
    detectOpenClarification(
      "Example in code:\n```\nShould I delete this?\n```\nDone.",
    ),
    false,
  );
  assert.equal(detectOpenClarification(""), false);
  assert.equal(detectOpenClarification(null), false);
});

test("buildStopFollowupMessage reminds resolution priority", () => {
  const msg = buildStopFollowupMessage({ loopCount: 0 });
  assert.match(msg, /resolution priority/i);
  assert.match(msg, /minimal scope/i);
  assert.match(msg, /Confidence:/);
  assert.ok(msg.length <= 800);

  const retry = buildStopFollowupMessage({ loopCount: 1 });
  assert.match(retry, /still appears/i);
  assert.match(retry, /rule 5/i);
});
