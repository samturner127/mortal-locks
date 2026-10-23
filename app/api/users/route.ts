import { NextResponse } from "next/server";
import { getUsers } from "@/lib/db";

// See app/api/games/route.ts for why this is needed — otherwise Next.js
// freezes this response at build time instead of querying fresh each time.
export const dynamic = "force-dynamic";

export async function GET() {
  // getUsers() never selects the PIN column, so there's nothing to strip here.
  const users = await getUsers();
  return NextResponse.json({ users });
}
