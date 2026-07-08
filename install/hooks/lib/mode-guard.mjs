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
