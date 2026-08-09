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
  "use kodaelus prepare",
  "use kodaelus 6",
  "stop kodaelus",
  "please fix the login bug",
  "run it",
  "execute",
  "execute the tests",
  "use kodaelus main\nuse kodaelus 1\n# Goal",
  "use kodaelus main\nkodaelus prompt mode in body",
  "Body mentions use kodaelus 1 here\n\nuse kodaelus main",
  "use kodaelus 1\n\nwe can switch to main later",
  "use kodaelus lite\n\nthen use kodaelus main",
  "Docs say use kodaelus 1.\n\nrun it",
  "kodaelus prompt mode was used.\n\nexecute",
  "# Title (Main mode (0))\nMain mode (0). Bug fix. TDD.",
  "use kodaelus main\n\n# Title (Main mode (0))\nMain mode (0). Bug fix. TDD.",
  "Bug fix for music sync.",
  "bug fix",
];

describe("mode detect parity", () => {
  it("SDK mode detection matches hook session-store", () => {
    for (const sample of samples) {
      expect(sdkDetect(sample)).toBe(hookDetect(sample));
    }
  });
});
