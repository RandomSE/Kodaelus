export function validateInstructionsPolicy(
  content: string,
  minLength?: number,
): string[];

export function findMissingPolicyKeywords(content: string): string[];

export function checkHookAbsentContract(content: string): string[];

export const CORE_POLICY_KEYWORDS: string[];
export const HARDENED_POLICY_KEYWORDS: string[];
export const HOOK_ABSENT_HEADING: string;
export const HOOK_ABSENT_REQUIRED_PHRASES: string[];
