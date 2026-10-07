/**
 * CLI used by .github/workflows/auto-merge.yml.
 *   tsx check-eligibility.ts <files.json from `gh api pulls/N/files`> <pr.json from `gh pr view --json labels,author`> <allowed authors, comma-separated>
 * Prints "eligible" or "not-eligible" on the first line, then the reasons.
 */
import { readFileSync } from "node:fs";
import { checkEligibility } from "../../src/lib/improvements/eligibility";

const [filesPath, prPath, allowed = ""] = process.argv.slice(2);
// `gh api --paginate` concatenates JSON arrays; normalise "][" boundaries.
const rawFiles = readFileSync(filesPath, "utf8").replace(/\]\s*\[/g, ",");
const files = (JSON.parse(rawFiles) as { filename: string; additions: number; deletions: number; status: string }[]).map((f) => ({
  path: f.filename,
  additions: f.additions,
  deletions: f.deletions,
  status: f.status,
}));
const pr = JSON.parse(readFileSync(prPath, "utf8")) as { labels: { name: string }[]; author: { login: string; is_bot?: boolean } };
const author = pr.author.is_bot ? `${pr.author.login}[bot]` : pr.author.login;
const r = checkEligibility({
  files,
  labels: pr.labels.map((l) => l.name),
  author,
  allowedAuthors: allowed.split(",").map((s) => s.trim()).filter(Boolean),
});
console.log(r.eligible ? "eligible" : "not-eligible");
for (const reason of r.reasons) console.log(`- ${reason}`);
