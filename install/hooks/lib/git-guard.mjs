/** Read-only git subcommands permitted while Kodaelus is active. */
export const ALLOWED_GIT_SUBCOMMANDS = new Set(["status", "diff", "log"]);

const GH_COMMAND =
  /(^|[\s;&|])gh\s+(auth|repo|pr|issue|release|workflow)\b/i;

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
 * True when the shell command must be denied during an active Kodaelus session.
 * Allows read-only git: status, diff, log. Blocks all other git and gh subcommands.
 */
export function isBlockedGitShellCommand(command) {
  if (typeof command !== "string" || command.length === 0) return false;
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
