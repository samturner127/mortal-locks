import { NextResponse } from "next/server";
import { hasDoubleDownElsewhere } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = Number(searchParams.get("userId"));
  const weekId = Number(searchParams.get("weekId"));
  if (!userId || !weekId) {
    return NextResponse.json({ error: "userId and weekId are required." }, { status: 400 });
  }
  const usedElsewhere = await hasDoubleDownElsewhere(userId, weekId);
  return NextResponse.json({ usedElsewhere });
}
