import { NextResponse } from "next/server";
import { getUserById } from "@/lib/db";
import { checkRateLimit, clientIp, LOGIN_ATTEMPTS } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, pin } = body ?? {};

  if (typeof userId !== "number" || typeof pin !== "string") {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }

  // Counted before the PIN is so much as looked at — capping guesses is the
  // entire point. The pool's PIN is 4 digits and shared, so it isn't just a
  // login: it's the only credential that authorizes a write anywhere in the
  // app (see /api/picks), which makes unlimited attempts the real exposure
  // rather than someone reading a player's picks.
  const { allowed, retryAfterSeconds } = await checkRateLimit(`login:${clientIp(req)}`, LOGIN_ATTEMPTS);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const user = await getUserById(userId);
  if (!user || user.pin !== pin) {
    return NextResponse.json({ error: "Name/PIN didn't match." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
