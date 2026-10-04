import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

type IntentMode = "main" | "prompt" | "bug" | "suggest" | "lite" | "question" | "prepare" | "ship";

export type IntentRecommendation = {
  mode: IntentMode;
  activation: string;
  switchesMode: false;
  line: string;
};

export type CeremonyRecommendation = {
  tier: "full" | "standard" | "lite";
  modeHint: "lite" | null;
  switchesMode: false;
  line: string;
};

type SharedIntentRouter = {
  recommendKodaelusIntent: (prompt: string) => IntentRecommendation;
  recommendCeremony: (prompt: string) => CeremonyRecommendation;
};

const shared = require(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../install/lib/intent-router.mjs",
  ),
) as SharedIntentRouter;

export const recommendKodaelusIntent = shared.recommendKodaelusIntent;
export const recommendCeremony = shared.recommendCeremony;
