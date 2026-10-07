import { NextResponse, type NextRequest } from "next/server";

/**
 * Access control.
 *
 * - No SIMLIFE_ACCESS_TOKEN: local-only. Requests must address a loopback host
 *   (also blocks DNS-rebinding attacks against the local server).
 * - SIMLIFE_ACCESS_TOKEN set: every request needs the access cookie (set via
 *   /login) or `Authorization: Bearer <token>`. Required for any remote deployment.
 *
 * Route handlers additionally require a custom header on writes (CSRF defence).
 */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function proxy(req: NextRequest) {
  const token = process.env.SIMLIFE_ACCESS_TOKEN?.trim();
  const path = req.nextUrl.pathname;

  if (!token) {
    const host = req.headers.get("host") ?? "";
    if (!LOOPBACK.test(host)) {
      return new NextResponse(
        "Simulated Life is local-only. Set SIMLIFE_ACCESS_TOKEN to allow access from other hosts (see README → Remote access).",
        { status: 403, headers: { "content-type": "text/plain" } },
      );
    }
    return NextResponse.next();
  }

  if (path === "/login" || path === "/api/auth") return NextResponse.next();
  const expected = await sha256(token);
  const cookie = req.cookies.get("simlife_access")?.value ?? "";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (timingSafeEqual(cookie, expected) || (bearer && timingSafeEqual(await sha256(bearer), expected))) {
    return NextResponse.next();
  }
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
