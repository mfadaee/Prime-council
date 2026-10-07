import { json, route } from "@/lib/api";
import { readImprovements } from "@/lib/improvements/history";
import { getAutonomy } from "@/lib/settings";

export const GET = route(async (_req, _ctx, db) => {
  const { items, error } = await readImprovements();
  return json({
    items,
    error,
    // Facts the app can actually know; the scheduler itself lives in GitHub Actions or cron.
    schedule: {
      configuredIn: [".github/workflows/daily-improvement.yml", "scripts/daily-improvement/run-local.sh"],
      activeHere: false,
      note: "The app cannot see whether the external scheduler is enabled. It is inactive until DAILY_IMPROVEMENT_ENABLED=true is set on the GitHub repository (or a cron job runs run-local.sh).",
    },
    globalPause: (await getAutonomy(db)).globalPause,
  });
});
