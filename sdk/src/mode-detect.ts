import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { KodaelusModeName } from "./runtime-guards.js";

const require = createRequire(import.meta.url);

type SharedKodaelusMode = {
  detectKodaelusMode: (prompt: string) => KodaelusModeName | null;
  isBugInvestigationMode: (mode: KodaelusModeName | null | undefined) => boolean;
  isDeactivatePrompt: (prompt: string) => boolean;
  isMutatingMode: (mode: KodaelusModeName | null | undefined) => boolean;
  isReadOnlyMode: (mode: KodaelusModeName | null | undefined) => boolean;
};

const shared = require(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../install/lib/kodaelus-mode.mjs",
  ),
) as SharedKodaelusMode;

export const detectKodaelusMode = shared.detectKodaelusMode;
export const isBugInvestigationMode = shared.isBugInvestigationMode;
export const isDeactivatePrompt = shared.isDeactivatePrompt;
export const isMutatingMode = shared.isMutatingMode;
export const isReadOnlyMode = shared.isReadOnlyMode;
