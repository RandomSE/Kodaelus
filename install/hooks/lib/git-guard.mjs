export const GIT_COMMAND =
  /(^|[\s;&|])(git\s+[\w-]+|git$)|(^|[\s;&|])gh\s+(auth|repo|pr|issue|release|workflow)\b/i;

export function isGitShellCommand(command) {
  return typeof command === "string" && GIT_COMMAND.test(command);
}
