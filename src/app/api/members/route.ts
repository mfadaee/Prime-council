import { asc } from "drizzle-orm";
import { body, HttpError, json, route } from "@/lib/api";
import { members, providers } from "@/lib/db/schema";
import { audit } from "@/lib/council/service";
import { memberCreateSchema, publicMembers } from "@/lib/council/members";

export const GET = route(async (_req, _ctx, db) => {
  const [m, p] = await Promise.all([db.select().from(members).orderBy(asc(members.seat)), db.select().from(providers)]);
  return json(publicMembers(m, p));
});

export const POST = route(async (req, _ctx, db) => {
  const input = await body(req, memberCreateSchema);
  const existing = await db.select({ id: members.id, seat: members.seat }).from(members);
  if (existing.length >= 12) throw new HttpError(409, "The council is limited to 12 members");
  const provs = await db.select({ id: providers.id }).from(providers);
  if (!provs.some((p) => p.id === input.providerId)) throw new HttpError(400, "Unknown provider");
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "member";
  let id = base;
  for (let i = 2; existing.some((e) => e.id === id); i++) id = `${base}-${i}`;
  const seat = Math.max(-1, ...existing.map((e) => e.seat)) + 1;
  const [row] = await db.insert(members).values({ ...input, id, seat }).returning();
  await audit(db, "prime", "member.create", id, { role: input.role, providerId: input.providerId, model: input.model });
  return json(row, { status: 201 });
});
