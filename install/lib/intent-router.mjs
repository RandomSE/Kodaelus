import { detectKodaelusMode } from "./kodaelus-mode.mjs";

/**
 * @typedef {'main' | 'prompt' | 'bug' | 'suggest' | 'lite' | 'question' | 'prepare' | 'ship'} KodaelusMode
 * @typedef {'full' | 'standard' | 'lite'} DeliveryTierName
 */

/** @type {Record<KodaelusMode, { label: string, activation: string }>} */
const MODE_COPY = {
  main: { label: "Main", activation: "use kodaelus main" },
  prompt: { label: "Planner / Prompt", activation: "use kodaelus prompt" },
  bug: { label: "Bug Investigation", activation: "use kodaelus bug" },
  suggest: { label: "Suggest", activation: "use kodaelus suggest" },
  lite: { label: "Mode Lite", activation: "use kodaelus lite" },
  question: { label: "Question", activation: "use kodaelus question" },
  prepare: { label: "Prepare", activation: "use kodaelus prepare" },
  ship: { label: "Ship", activation: "use kodaelus ship" },
};

/**
 * @param {KodaelusMode} mode
 */
function recommendation(mode) {
  const copy = MODE_COPY[mode];
  return {
    mode,
    activation: copy.activation,
    switchesMode: false,
    line: `Recommend ${copy.label} (\`${copy.activation}\`). Does not switch mode.`,
  };
}

/**
 * Natural-language mode hint. Never activates a session.
 * Explicit activation phrases still only produce a recommendation here;
 * `detectKodaelusMode` is what stores the mode.
 * @param {string} prompt
 */
export function recommendKodaelusIntent(prompt) {
  const text = `${prompt ?? ""}`.trim();
  const explicit = detectKodaelusMode(text);
  if (explicit && MODE_COPY[explicit]) return recommendation(explicit);

  if (/\b(investigate|root cause|reproduction)\b|\bdo not patch\b|\bdon't patch\b/i.test(text)) {
    return recommendation("bug");
  }
  if (/\bship this\b/i.test(text) || /\bopen a pull request\b/i.test(text)) {
    return recommendation("ship");
  }
  if (
    /\bprepare\b[\s\S]{0,48}\bcommit\b/i.test(text) ||
    /\b(ready to commit|commit message|about to commit)\b/i.test(text)
  ) {
    return recommendation("prepare");
  }
  if (
    /\bwhat should we\b/i.test(text) ||
    /\bwhat(?:'s| is) wrong\b/i.test(text) ||
    /\b(suggest|feature ideas)\b/i.test(text)
  ) {
    return recommendation("suggest");
  }
  if (/^\s*(explain|describe)\b|\bhow (?:does|do|did)\b|\bwhy (?:does|is|did)\b/i.test(text)) {
    return recommendation("question");
  }
  if (/\bpaste-ready\b|\bwrite a spec\b|\bplanner\b/i.test(text)) {
    return recommendation("prompt");
  }
  if (/\b(typo|docs?-only|tiny edit)\b|\bsingle[- ]file\b|\bone file\b/i.test(text)) {
    return recommendation("lite");
  }
  if (/\b(implement|fix|add|build|refactor)\b/i.test(text)) {
    return recommendation("main");
  }
  if (/\?\s*$/.test(text)) return recommendation("question");
  return recommendation("main");
}

/**
 * Delivery-tier hint from task size. Does not switch mode.
 * @param {string} prompt
 */
export function recommendCeremony(prompt) {
  const text = `${prompt ?? ""}`;
  const lite = /\bdocs?-only\b|\bsingle[- ]file\b|\bone file\b|\btypo\b|\btiny edit\b/i.test(text);
  const standard =
    !lite &&
    (/\b(?:[2-4]|two|three|four) files?\b/i.test(text) ||
      /\bsmall change\b/i.test(text) ||
      /\bcouple of files\b/i.test(text));

  if (lite) {
    return {
      tier: "lite",
      modeHint: "lite",
      switchesMode: false,
      line: "Recommend Mode Lite (`use kodaelus lite`) or Delivery Tier Lite inside Main. Does not switch mode.",
    };
  }
  if (standard) {
    return {
      tier: "standard",
      modeHint: null,
      switchesMode: false,
      line: "Recommend Delivery Tier Standard. Does not switch mode.",
    };
  }
  return {
    tier: "full",
    modeHint: null,
    switchesMode: false,
    line: "Recommend Delivery Tier Full. Does not switch mode.",
  };
}
