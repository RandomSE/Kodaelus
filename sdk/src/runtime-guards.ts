export type SdkPreflightOptions = {
  mode: KodaelusModeName;
  task: string;
  cwd: string;
};

export type SdkPreflightResult = {
  warnings: string[];
  mode: KodaelusModeName;
};

export type KodaelusModeName =
  | "main"
  | "prompt"
  | "bug"
  | "suggest"
  | "lite"
  | "question"
  | "prepare";

const READ_ONLY_MODES = new Set<KodaelusModeName>([
  "prompt",
  "suggest",
  "question",
]);

export function describeSdkLimitations(): string {
  return [
    "Kodaelus SDK runs policy text through the Cursor Agent API.",
    "IDE hooks (git read-only, delete backup/manifest, scope creep, confidence format) apply only in Cursor with Kodaelus session active.",
    "Use Cursor IDE + `use kodaelus` for full safety guards; use the SDK for automation with policy preloading.",
  ].join(" ");
}

export function buildModeHeader(mode: KodaelusModeName): string {
  const lines = [`## Kodaelus mode: ${mode}`];

  if (READ_ONLY_MODES.has(mode)) {
    lines.push(
      "",
      "This task is read-only in SDK policy terms - do not mutate project files. " +
        "Upgrade phrasing for a full implementation run: `use kodaelus main` or `use kodaelus lite`.",
    );
  }

  if (mode === "bug") {
    lines.push(
      "",
      "Bug Investigation mode - maximize visibility and diagnostics under `.kodaelus/bugs/`; do not ship the fix.",
    );
  }

  if (mode === "prepare") {
    lines.push(
      "",
      "Prepare mode - review changes since HEAD, run the full test suite (fix+rerun max 3 cycles), " +
        "then propose a commit message. Git stays read-only; do not run git commit/add/gh.",
    );
  }

  return lines.join("\n");
}

export function normalizeDetectedMode(
  mode: string | null | undefined,
): KodaelusModeName {
  if (
    mode === "main" ||
    mode === "prompt" ||
    mode === "bug" ||
    mode === "suggest" ||
    mode === "lite" ||
    mode === "question" ||
    mode === "prepare"
  ) {
    return mode;
  }
  return "main";
}

export function runSdkPreflight(options: SdkPreflightOptions): SdkPreflightResult {
  const warnings: string[] = [describeSdkLimitations()];

  if (READ_ONLY_MODES.has(options.mode)) {
    warnings.push(
      `Read-only mode (${options.mode}) detected - the SDK cannot enforce tool or shell blocks. ` +
        "Use Cursor IDE with Kodaelus active for hard read-only guards.",
    );
  }

  if (options.mode === "bug") {
    warnings.push(
      "Bug Investigation mode - policy expects diagnostics under .kodaelus/bugs/; do not ship fixes until main upgrade.",
    );
  }

  if (options.mode === "prepare") {
    warnings.push(
      "Prepare mode - full suite + commit message proposal only; SDK cannot enforce git read-only. Use Cursor IDE for hard git guards.",
    );
  }

  return { warnings, mode: options.mode };
}
