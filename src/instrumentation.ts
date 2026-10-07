/**
 * Runs once per server start. Starts the background scheduler (which does
 * nothing unless the Prime enables autonomy) and recovers sessions that were
 * running when the previous server process stopped.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { boot } = await import("./lib/boot");
  await boot();
}
