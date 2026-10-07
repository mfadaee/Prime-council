import { json, route } from "@/lib/api";
import { chronicle } from "@/lib/chronicle";

export const GET = route(async (_req, _ctx, db) => json(await chronicle(db)));
