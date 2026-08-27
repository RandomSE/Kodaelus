/**
 * Detect Cursor cloud / SDK / headless runtimes where IDE hooks may be
 * missing or git ship is required.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isCloudOrHeadlessRuntime(env = process.env) {
  const flag = `${env.KODAELUS_CLOUD_DELIVERY ?? ""}`.toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return env.CURSOR_AGENT === "1";
}

/**
 * Cloud/SDK ship path that may use the git allowlist (not Cursor IDE).
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isCloudDeliveryRuntime(env = process.env) {
  return isCloudOrHeadlessRuntime(env);
}
