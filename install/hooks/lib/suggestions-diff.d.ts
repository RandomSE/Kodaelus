export const SUGGESTIONS_DIR_REL: string;

export function extractSuggestionKeys(content: string): Set<string>;

export function diffPriorSuggestions(
  projectRoot: string,
  subMode: "issues" | "features",
  excludeFile?: string,
): {
  priorFiles: string[];
  addressed: string[];
  stillOpen: string[];
};
