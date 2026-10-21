import { json, route } from "@/lib/api";
import { listDiscoveries } from "@/lib/discovery/service";

/** Searchable list of Beyond-the-System investigations (`?q=` matches assumptions, alternatives, lessons). */
export const GET = route(async (req, _ctx, db) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return json({ discoveries: await listDiscoveries(db, q) });
});
