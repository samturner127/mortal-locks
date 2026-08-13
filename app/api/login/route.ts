import { NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, pin } = body ?? {};

  if (typeof userId !== "number" || typeof pin !== "string") {
    return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user || user.pin !== pin) {
    return NextResponse.json({ error: "Name/PIN didn't match." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
