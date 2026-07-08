import { describe, expect, it } from "vitest";
import { detectKodaelusMode as hookDetect } from "../../install/hooks/lib/session-store.mjs";
import { detectKodaelusMode as sdkDetect } from "../src/mode-detect.js";

const samples = [
  "use kodaelus",
  "use kodaelus 1",
  "use kodaelus 2",
  "use kodaelus bugfix",
  "use kodaelus suggest issues",
  "use kodaelus lite",
  "use kodaelus question",
  "stop kodaelus",
  "please fix the login bug",
];

describe("mode detect parity", () => {
  it("SDK mode detection matches hook session-store", () => {
    for (const sample of samples) {
      expect(sdkDetect(sample)).toBe(hookDetect(sample));
    }
  });
});
