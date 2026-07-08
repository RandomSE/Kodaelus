import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

type SharedPreferenceIntent = {
  extractPreferenceIntent: (prompt: string) => string | null;
  normalizePreferenceKey: (intent: string) => string;
};

const shared = require(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../install/lib/preference-intent.mjs",
  ),
) as SharedPreferenceIntent;

export const extractPreferenceIntent = shared.extractPreferenceIntent;
export const normalizePreferenceKey = shared.normalizePreferenceKey;
