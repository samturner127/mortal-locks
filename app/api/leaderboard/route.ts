import { NextResponse } from "next/server";
import { getStandings } from "@/lib/db";

// See app/api/games/route.ts for why this is needed — otherwise Next.js
// freezes this response at build time instead of querying fresh each time.
export const dynamic = "force-dynamic";

export async function GET() {
  const standings = await getStandings();
  return NextResponse.json({ standings });
}
