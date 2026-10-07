import { timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { take } from "@/lib/security/rate-limit";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Exchange the access token for an httpOnly cookie (only used when SIMLIFE_ACCESS_TOKEN is set). */
export async function POST(req: Request) {
  const token = process.env.SIMLIFE_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Access tokens are not enabled" }, { status: 400 });
  if (!take(`auth:${req.headers.get("x-forwarded-for") ?? "local"}`, { capacity: 5, refillPerSec: 5 / 300 }).ok) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = z.object({ token: z.string().max(500) }).safeParse(await req.json().catch(() => null));
  const given = parsed.success ? parsed.data.token : "";
  const ok = timingSafeEqual(Buffer.from(sha(given)), Buffer.from(sha(token)));
  if (!ok) return Response.json({ error: "Invalid token" }, { status: 401 });
  const secure = new URL(req.url).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `simlife_access=${sha(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`,
    },
  });
}
