import "server-only";
import { getDb } from "@/lib/db/client";
import { getAutonomy } from "@/lib/settings";
import { getWorld, stepWorld } from "./store";

/**
 * Auto-run loop for the world. Advances one tick per `speedMs` while the world is
 * running and the global autonomy pause is off. Deterministic engine, no model
 * calls, so it costs nothing; it still honours the global pause.
 */
const g = globalThis as unknown as { __simlifeWorldRunner?: { timer?: ReturnType<typeof setTimeout>; started: boolean } };
const runner = (g.__simlifeWorldRunner ??= { started: false });

async function loop() {
  let delay = 1000;
  try {
    const db = await getDb();
    const world = await getWorld(db);
    delay = world.speedMs;
    if (world.status === "running" && !(await getAutonomy(db)).globalPause) await stepWorld(db, 1);
  } catch (err) {
    console.error("[world]", err instanceof Error ? err.message : err);
  }
  runner.timer = setTimeout(loop, Math.max(250, delay));
  runner.timer.unref?.();
}

export function startWorldRunner(): void {
  if (runner.started) return;
  runner.started = true;
  runner.timer = setTimeout(loop, 2000);
}
