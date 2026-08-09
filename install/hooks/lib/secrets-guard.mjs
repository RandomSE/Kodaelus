/**
 * Heuristic detection of obvious secrets in Write/StrReplace/ApplyPatch payloads.
 */

const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;

const ENV_BODY =
  /(?:^|\n)\s*(?:export\s+)?(?:[A-Z][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_PASS|_CREDENTIAL|_API_KEY))\s*=\s*[^\s#]+/m;

const API_KEY_ASSIGN =
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*['"`]?[A-Za-z0-9_\-/+=.]{16,}/i;

const OBVIOUS_TOKEN =
  /\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/;

/**
 * @param {string} text
 * @returns {{ kind: string, snippet: string }[]}
 */
export function findSecretLeaks(text) {
  /** @type {{ kind: string, snippet: string }[]} */
  const hits = [];
  if (typeof text !== "string" || !text.trim()) return hits;

  if (PRIVATE_KEY_BLOCK.test(text)) {
    hits.push({ kind: "private_key_block", snippet: "PEM/private key block" });
  }
  if (ENV_BODY.test(text)) {
    hits.push({ kind: "env_secret_assignment", snippet: "env-style KEY=value secret" });
  }
  if (API_KEY_ASSIGN.test(text)) {
    hits.push({ kind: "api_key_assignment", snippet: "API key / token assignment" });
  }
  if (OBVIOUS_TOKEN.test(text)) {
    hits.push({ kind: "obvious_token", snippet: "obvious credential token pattern" });
  }
  return hits;
}

/**
 * @param {string[]} texts
 * @returns {{ kind: string, snippet: string }[]}
 */
export function findSecretLeaksInTexts(texts) {
  /** @type {{ kind: string, snippet: string }[]} */
  const all = [];
  for (const text of texts) {
    all.push(...findSecretLeaks(text));
  }
  return all;
}

/**
 * @param {{ kind: string, snippet: string }[]} leaks
 * @param {string} relativePath
 * @returns {{ permission: 'deny', user_message: string, agent_message: string }}
 */
export function denySecretLeak(leaks, relativePath) {
  const kinds = [...new Set(leaks.map((l) => l.kind))].join(", ");
  return {
    permission: "deny",
    user_message:
      `Kodaelus secrets guard blocked writing credentials to "${relativePath}". ` +
      `Detected: ${kinds}. Move secrets to env / secret store, or use an allowlisted fixture path.`,
    agent_message:
      `Secrets/credential leak denied for "${relativePath}" (${kinds}). ` +
      "Do not write API keys, private key blocks, or .env secret bodies outside fixtures/test/.kodaelus paths.",
  };
}
