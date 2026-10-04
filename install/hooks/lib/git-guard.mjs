/** Read-only git subcommands permitted while Kodaelus is active. */
export const ALLOWED_GIT_SUBCOMMANDS = new Set(["status", "diff", "log"]);

/** Extra git subcommands allowed only for cloudDelivery ship (no force/reset/config). */
export const CLOUD_DELIVERY_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "branch",
  "add",
  "commit",
  "push",
  "checkout",
  "switch",
]);

const GH_COMMAND =
  /(^|[\s;&|])gh\s+(auth|repo|pr|issue|release|workflow|run)\b/i;
const GH_PR_CREATE = /(^|[\s;&|])gh\s+pr\s+create\b/i;
const SHIP_GH =
  /^\s*(?:[\w.-]+=\s*)*gh\s+(?:pr\s+(?:create|view|checks|status)|run\s+(?:list|view))\b/i;

/** Git subcommands allowed in IDE Ship mode (still no force/reset/config). */
export const SHIP_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "branch",
  "add",
  "commit",
  "push",
  "checkout",
  "switch",
]);
const GIT_FORCE = /\s(?:--force|--force-with-lease)(?:\s|$)/i;
const GIT_SHORT_FORCE_PUSH = /(^|[\s;&|])git\b[\s\S]*\bpush\b[\s\S]*\s-f(?:\s|$)/i;

/** Git CLI options that consume the next token as a value. */
const GIT_OPT_WITH_ARG = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
]);

function isGitToken(token) {
  const bare = token.replace(/^['"]|['"]$/g, "");
  return /^git(\.exe)?$/i.test(bare) || /[/\\]git(\.exe)?$/i.test(bare);
}

function tokenizeSegment(segment) {
  const tokens = [];
  let i = 0;
  while (i < segment.length) {
    while (i < segment.length && /\s/.test(segment[i])) i++;
    if (i >= segment.length) break;

    const quote = segment[i];
    if (quote === '"' || quote === "'") {
      i++;
      const start = i;
      while (i < segment.length && segment[i] !== quote) {
        if (segment[i] === "\\") i++;
        i++;
      }
      tokens.push(segment.slice(start, i));
      if (i < segment.length) i++;
      continue;
    }

    const match = segment.slice(i).match(/^[^\s;&|()]+/);
    if (!match) {
      i++;
      continue;
    }
    tokens.push(match[0]);
    i += match[0].length;
  }
  return tokens;
}

function splitShellSegments(command) {
  return command.split(/\s*(?:;|\|\||&&|\|)\s*/);
}

function gitSubcommandFromTokens(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (isGitToken(token)) {
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      const bare = token.split("=")[0];
      if (GIT_OPT_WITH_ARG.has(bare) && !token.includes("=")) {
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    return token.toLowerCase();
  }
  return null;
}

function isEnvAssignment(token) {
  return /^[\w.-]+=/.test(token);
}

function gitSubcommandsInSegment(segment) {
  const tokens = tokenizeSegment(segment);
  let i = 0;
  while (i < tokens.length && isEnvAssignment(tokens[i])) i++;
  if (i >= tokens.length || !isGitToken(tokens[i])) return [];

  return [gitSubcommandFromTokens(tokens.slice(i))];
}

/**
 * @param {string} command
 * @param {string | null} sub
 * @returns {boolean}
 */
function isDangerousCloudGit(command, sub) {
  if (sub === "reset" || sub === "config" || sub === "rebase" || sub === "clean") {
    return true;
  }
  if (GIT_FORCE.test(command) || GIT_SHORT_FORCE_PUSH.test(command)) return true;
  if (sub === "branch" && /(?:\s-D\b|\s--delete\b)/.test(command)) return true;
  if (sub === "checkout" && !/(?:^|\s)(?:-b|-B|--orphan)\b/.test(command)) return true;
  if (sub === "switch" && !/(?:^|\s)(?:-c|--create)\b/.test(command)) return true;
  return false;
}

/**
 * Cloud/SDK ship allowlist: branch/add/commit/push and gh pr create.
 * No force/reset/config. IDE callers must not use this path.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isCloudDeliveryAllowedGitCommand(command) {
  if (typeof command !== "string" || command.length === 0) return false;
  if (GH_COMMAND.test(command)) {
    return GH_PR_CREATE.test(command);
  }

  let sawGit = false;
  for (const segment of splitShellSegments(command)) {
    const subcommands = gitSubcommandsInSegment(segment);
    if (subcommands.length === 0) continue;
    sawGit = true;
    for (const sub of subcommands) {
      if (sub === null || !CLOUD_DELIVERY_GIT_SUBCOMMANDS.has(sub)) return false;
      if (isDangerousCloudGit(command, sub)) return false;
    }
  }
  return sawGit;
}

/**
 * @param {string} command
 * @returns {boolean}
 */
function commandHasGitOrGh(command) {
  for (const segment of splitShellSegments(command)) {
    if (gitSubcommandsInSegment(segment).length > 0) return true;
    if (/^\s*(?:[\w.-]+=\s*)*gh\b/i.test(segment)) return true;
  }
  return false;
}

/**
 * IDE Ship allowlist: status/diff/log/branch/add/commit/push, branch create,
 * gh pr create|view|checks|status, and gh run list|view.
 * No force, reset, rebase, config, merge, or push to main/master.
 *
 * @param {string} command
 * @returns {boolean}
 */
export function isShipAllowedGitCommand(command) {
  if (typeof command !== "string" || command.length === 0) return false;
  if (GIT_FORCE.test(command) || GIT_SHORT_FORCE_PUSH.test(command)) return false;

  let saw = false;
  for (const segment of splitShellSegments(command)) {
    if (/^\s*(?:[\w.-]+=\s*)*gh\b/i.test(segment)) {
      saw = true;
      if (!SHIP_GH.test(segment)) return false;
    }
    const subcommands = gitSubcommandsInSegment(segment);
    if (subcommands.length === 0) continue;
    saw = true;
    for (const sub of subcommands) {
      if (sub === null || !SHIP_GIT_SUBCOMMANDS.has(sub)) return false;
      if (isDangerousCloudGit(segment, sub)) return false;
      if (sub === "push" && /\b(main|master)\b/i.test(segment)) return false;
    }
  }
  return saw;
}

/**
 * True when the shell command must be denied during an active Kodaelus session.
 * Allows read-only git: status, diff, log. Blocks all other git and gh subcommands.
 * When options.cloudDelivery is true, also allows branch/add/commit/push and gh pr create.
 * When options.ship is true, uses the IDE Ship allowlist (no force, no push to main/master).
 *
 * @param {string} command
 * @param {{ cloudDelivery?: boolean, ship?: boolean }} [options]
 */
export function isBlockedGitShellCommand(command, options = {}) {
  if (typeof command !== "string" || command.length === 0) return false;
  if (options.ship === true) {
    if (!commandHasGitOrGh(command)) return false;
    return !isShipAllowedGitCommand(command);
  }
  if (options.cloudDelivery === true) {
    const ideBlocked = isBlockedGitShellCommand(command, {});
    if (!ideBlocked) return false;
    return !isCloudDeliveryAllowedGitCommand(command);
  }
  if (GH_COMMAND.test(command)) return true;

  for (const segment of splitShellSegments(command)) {
    const subcommands = gitSubcommandsInSegment(segment);
    if (subcommands.length === 0) continue;

    for (const sub of subcommands) {
      if (sub === null || !ALLOWED_GIT_SUBCOMMANDS.has(sub)) {
        return true;
      }
    }
  }

  return false;
}

/** @deprecated Use isBlockedGitShellCommand */
export function isGitShellCommand(command) {
  return isBlockedGitShellCommand(command);
}
