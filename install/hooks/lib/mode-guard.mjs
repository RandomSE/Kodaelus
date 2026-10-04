/**
 * Shared Kodaelus mode guard messages for preToolUse hooks.
 */

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isMutatingToolName(toolName) {
  const name = `${toolName}`.toLowerCase().replace(/_/g, "");
  return (
    name.includes("write") ||
    name.includes("strreplace") ||
    name.includes("delete") ||
    name.includes("applypatch")
  );
}

/**
 * @param {string} mode
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyReadOnlyTool(mode) {
  const upgrade =
    mode === "question"
      ? "**use kodaelus main** for implementation"
      : "**use kodaelus main** or **use kodaelus lite**";
  return {
    permission: "deny",
    user_message: `Kodaelus ${mode} mode is read-only. Reply ${upgrade} to mutate files.`,
    agent_message:
      `Read-only Kodaelus mode (${mode}). Do not use Write/StrReplace/Delete/ApplyPatch. ` +
      `User must upgrade: ${upgrade.replace(/\*\*/g, "")}.`,
  };
}

/**
 * @param {string} relativePath
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyBugModeDelete(relativePath) {
  return {
    permission: "deny",
    user_message:
      `Bug Investigation mode blocks deletion of "${relativePath}" outside .kodaelus/. ` +
      "Diagnostic artifacts may live under .kodaelus/bugs/.",
    agent_message:
      `Bug Investigation mode: whole-file delete of "${relativePath}" blocked. ` +
      "Only .kodaelus/ artifacts may be deleted.",
  };
}

/**
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyReadOnlyShellDelete() {
  return {
    permission: "deny",
    user_message:
      "Kodaelus read-only mode blocks shell file deletion. Reply **use kodaelus main** or **use kodaelus lite**.",
    agent_message:
      "Shell delete blocked in read-only Kodaelus mode. User must upgrade to main or lite.",
  };
}

/**
 * @param {string} relativePath
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyBugModeWrite(relativePath) {
  return {
    permission: "deny",
    user_message:
      `Bug Investigation mode blocks product edits to "${relativePath}". ` +
      "Allowed: .kodaelus/**, *.test.*/*.spec.*, and diagnostic/instrumentation paths. " +
      "Reply **use kodaelus bugfix** to ship a fix.",
    agent_message:
      `Bug Investigation mode: Write/StrReplace/ApplyPatch denied for "${relativePath}". ` +
      "Use dossier/instrumentation/test paths only; upgrade with use kodaelus bugfix to fix.",
  };
}

/**
 * @param {string} relativePath
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denySuggestArtifactWrite(relativePath) {
  return {
    permission: "deny",
    user_message:
      `Suggest mode may only Write/StrReplace under .kodaelus/suggestions/ (blocked: "${relativePath}").`,
    agent_message:
      `Suggest mode artifact allowlist: only .kodaelus/suggestions/**. Denied "${relativePath}".`,
  };
}

/**
 * @param {string} relativePath
 * @param {number} fixCycleCount
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyPrepareFixCycle(relativePath, fixCycleCount) {
  return {
    permission: "deny",
    user_message:
      `Prepare/Ship fix-cycle cap reached (${fixCycleCount}/3). ` +
      `Product edit denied for "${relativePath}". ` +
      "Reply **prepare continue**, **ship continue**, or **allow more fix cycles** to unlock. Report **Not ready**.",
    agent_message:
      `Prepare/Ship fix-cycle cap (${fixCycleCount}/3): product edit to "${relativePath}" denied. ` +
      "Force Not ready. User may reply prepare continue or ship continue.",
  };
}

/**
 * @param {string} relativePath
 * @param {number} repairCount
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyShipCiRepair(relativePath, repairCount) {
  return {
    permission: "deny",
    user_message:
      `Ship CI repair cap reached (${repairCount}/3 product fixes after a red check). ` +
      `Product edit denied for "${relativePath}". ` +
      "Reply **ship ci continue** to unlock, or stop with Not ready and a Follow-Up Queue.",
    agent_message:
      `Ship CI-repair cap (${repairCount}/3): product edit to "${relativePath}" denied. ` +
      "Do not merge, force-push, or push main/master. Report Not ready.",
  };
}

/**
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denyPlanFirst() {
  return {
    permission: "deny",
    user_message:
      "Kodaelus Plan-first: emit Plan with a file-count estimate before mutating writes (headless/cloud).",
    agent_message:
      "emit Plan first (Delivery Tier, file count, blast radius, test command, Confidence: NN% | Evidence:) before Write/StrReplace/ApplyPatch/Delete. Do not wait for scope approved when no Plan has been emitted yet.",
  };
}
