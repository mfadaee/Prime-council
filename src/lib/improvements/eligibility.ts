/**
 * Auto-merge eligibility for automated improvement PRs.
 *
 * A PR may auto-merge (after required checks pass — enforced by GitHub branch
 * protection, never bypassed) only if it is small and touches none of the
 * sensitive areas below. Everything else stays a reviewable pull request.
 */
export interface EligibilityInput {
  files: { path: string; additions: number; deletions: number; status?: string }[];
  labels: string[];
  author: string;
  allowedAuthors: string[];
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/** Areas that always require human review. */
export const SENSITIVE: { pattern: RegExp; why: string }[] = [
  { pattern: /(^|\/)\.env/, why: "environment / secrets files" },
  { pattern: /^\.github\//, why: "CI, workflows and repository automation" },
  { pattern: /^src\/proxy\.ts$/, why: "authentication / access boundary" },
  { pattern: /^src\/app\/api\/auth\//, why: "authentication" },
  { pattern: /^src\/app\/login\//, why: "authentication" },
  { pattern: /^src\/lib\/security\//, why: "security controls" },
  { pattern: /^src\/lib\/api\.ts$/, why: "request guard (CSRF, rate limits)" },
  { pattern: /^src\/lib\/council\/budget\.ts$/, why: "spending controls" },
  { pattern: /^src\/lib\/settings\.ts$/, why: "limit bounds and spending settings" },
  { pattern: /^src\/lib\/providers\/pricing\.ts$/, why: "pricing / spending" },
  { pattern: /^src\/lib\/providers\/(registry|http)\.ts$/, why: "provider credentials handling" },
  { pattern: /^src\/lib\/providers\/adapters\//, why: "external provider calls (real spending)" },
  { pattern: /^src\/lib\/db\/schema\.ts$/, why: "database schema" },
  { pattern: /^drizzle\//, why: "database migrations" },
  { pattern: /^src\/lib\/improvements\/eligibility\.ts$/, why: "auto-merge rules themselves" },
  { pattern: /^scripts\/daily-improvement\//, why: "the improvement job itself" },
  { pattern: /^package(-lock)?\.json$/, why: "dependencies (supply chain)" },
];

export const MAX_CHANGED_LINES = 400;
export const MAX_FILES = 15;

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  if (!input.labels.includes("low-risk")) reasons.push('missing the "low-risk" label');
  if (input.labels.includes("needs-review")) reasons.push('labelled "needs-review"');
  if (!input.allowedAuthors.includes(input.author)) reasons.push(`author ${input.author} is not an allowed automation author`);
  if (input.files.length > MAX_FILES) reasons.push(`${input.files.length} files changed (max ${MAX_FILES})`);
  const lines = input.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  if (lines > MAX_CHANGED_LINES) reasons.push(`${lines} lines changed (max ${MAX_CHANGED_LINES})`);
  for (const f of input.files) {
    if (f.status === "removed" && !f.path.startsWith("tests/")) reasons.push(`deletes ${f.path}`);
    const hit = SENSITIVE.find((s) => s.pattern.test(f.path));
    if (hit) reasons.push(`touches ${f.path} (${hit.why})`);
  }
  return { eligible: reasons.length === 0, reasons };
}
