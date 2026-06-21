import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function extractDeletePath(input) {
  if (!input || typeof input !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (input);
  const toolInput =
    record.tool_input ??
    record.toolInput ??
    record.arguments ??
    record.input ??
    record;

  if (toolInput && typeof toolInput === "object") {
    const ti = /** @type {Record<string, unknown>} */ (toolInput);
    if (typeof ti.path === "string" && ti.path.trim()) return ti.path.trim();
  }
  if (typeof record.path === "string" && record.path.trim()) return record.path.trim();
  return null;
}

/**
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
export function isPathInside(root, target) {
  const resolvedRoot = resolve(root);
  const absolutePath = resolve(target);
  if (absolutePath === resolvedRoot) return true;
  const rel = relative(resolvedRoot, absolutePath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * @param {unknown} input
 * @param {string} filePath
 * @returns {string}
 */
export function resolveProjectRoot(input, filePath) {
  const record = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  const roots = record.workspace_roots ?? record.workspaceRoots;
  const absolutePath = resolve(filePath);

  if (Array.isArray(roots)) {
    /** @type {string[]} */
    const containing = [];
    for (const root of roots) {
      if (typeof root !== "string") continue;
      const resolvedRoot = resolve(root);
      if (isPathInside(resolvedRoot, absolutePath)) {
        containing.push(resolvedRoot);
        continue;
      }
      if (!isAbsolute(filePath) && !filePath.split(/[/\\]/).includes("..")) {
        const candidate = join(resolvedRoot, filePath);
        if (isPathInside(resolvedRoot, candidate)) {
          containing.push(resolvedRoot);
        }
      }
    }
    if (containing.length > 0) {
      containing.sort((a, b) => b.length - a.length);
      return containing[0];
    }
  }

  if (typeof record.cwd === "string" && record.cwd.trim()) {
    return resolve(record.cwd.trim());
  }

  return resolve(filePath, "..");
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
function referencesPath(haystack, needle) {
  if (!haystack || !needle) return false;
  const normalizedNeedle = needle.replace(/\\/g, "/");
  const base = basename(normalizedNeedle);
  return (
    haystack.includes(normalizedNeedle) ||
    haystack.includes(base) ||
    haystack.includes(normalizedNeedle.replace(/^\.\//, ""))
  );
}

/**
 * @param {string} projectRoot
 * @param {string} relativePath
 */
function readTextIfExists(projectRoot, relativePath) {
  const full = join(projectRoot, relativePath);
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} dir
 * @param {string} relativePath
 */
function scanDirectoryForReference(projectRoot, dir, relativePath) {
  const absoluteDir = join(projectRoot, dir);
  if (!existsSync(absoluteDir)) return false;

  let entries;
  try {
    entries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (scanDirectoryForReference(projectRoot, rel, relativePath)) return true;
      continue;
    }
    const text = readTextIfExists(projectRoot, rel);
    if (text && referencesPath(text, relativePath)) return true;
  }
  return false;
}

/**
 * @param {string} absoluteOrRelativePath
 * @param {string} [projectRoot=process.cwd()]
 * @returns {{ blocked: boolean, reasons: string[] }}
 */
export function checkEntryPoint(absoluteOrRelativePath, projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const absolutePath = resolve(root, absoluteOrRelativePath);
  const rel = normalize(relative(root, absolutePath)).replace(/\\/g, "/");
  const reasons = [];

  if (rel.startsWith("..")) {
    return { blocked: false, reasons };
  }

  const pkgText = readTextIfExists(root, "package.json");
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText);
      const candidates = [
        pkg.main,
        ...(typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {})),
        ...Object.values(typeof pkg.exports === "object" ? flattenExports(pkg.exports) : {}),
        ...Object.values(pkg.scripts ?? {}),
      ].filter((v) => typeof v === "string");

      for (const candidate of candidates) {
        if (candidate === rel || candidate.endsWith(`/${basename(rel)}`) || candidate === `./${rel}`) {
          reasons.push(`package.json references ${rel}`);
        }
      }
    } catch {
      // ignore invalid package.json
    }
  }

  if (rel.endsWith(".py")) {
    const py = readTextIfExists(root, rel);
    if (py && /if\s+__name__\s*==\s*['"]__main__['"]/.test(py)) {
      reasons.push("Python __main__ entry point");
    }
  }

  for (const config of [
    "Procfile",
    "Dockerfile",
    "Makefile",
    "justfile",
    "pyproject.toml",
    "setup.py",
    "turbo.json",
    "nx.json",
  ]) {
    const text = readTextIfExists(root, config);
    if (text && referencesPath(text, rel)) {
      reasons.push(`${config} references ${rel}`);
    }
  }

  for (const configGlob of ["vite.config.js", "vite.config.ts", "webpack.config.js", "rollup.config.js"]) {
    const text = readTextIfExists(root, configGlob);
    if (text && referencesPath(text, rel)) {
      reasons.push(`${configGlob} references ${rel}`);
    }
  }

  if (scanDirectoryForReference(root, ".github/workflows", rel)) {
    reasons.push("CI workflow references file");
  }

  for (const doc of ["README.md", "README"]) {
    const text = readTextIfExists(root, doc);
    if (text && referencesPath(text, rel)) {
      reasons.push(`${doc} references ${rel}`);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

/** @param {unknown} value @returns {string[]} */
function flattenExports(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenExports);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenExports);
  }
  return [];
}

/**
 * @param {string} command
 * @returns {string[]} candidate paths from shell delete commands
 */
export function extractShellDeleteTargets(command) {
  if (typeof command !== "string" || !command.trim()) return [];
  const targets = [];
  const patterns = [
    /\brm(?:\s+-[^\s]+)*\s+([^\s;&|><"']+)/gi,
    /\bdel(?:ete)?(?:\s+\/[^\s]+)*\s+([^\s;&|><"']+)/gi,
    /\bRemove-Item(?:\s+-[^\s]+)*\s+([^\s;&|><"']+)/gi,
    /\bunlink(?:Sync)?\s*\(?['"]?([^'";\s)]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(command)) !== null) {
      const candidate = match[1]?.replace(/^['"]|['"]$/g, "").trim();
      if (candidate && !candidate.startsWith("-")) targets.push(candidate);
    }
  }
  return targets;
}
