import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { councilSessions } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/council/seed";
import { startScheduler } from "@/lib/autonomy/scheduler";

export async function boot(): Promise<void> {
  try {
    const db = await getDb();
    await ensureSeeded(db);
    // Sessions cannot survive a restart (their runs lived in the old process).
    await db
      .update(councilSessions)
      .set({ status: "stopped", stopReason: "Interrupted (server restarted)", endedAt: new Date() })
      .where(eq(councilSessions.status, "running"));
    startScheduler();
  } catch (err) {
    console.error("[boot]", err instanceof Error ? err.message : err);
  }
}
