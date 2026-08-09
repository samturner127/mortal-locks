import { NextResponse } from "next/server";
import { getUsers } from "@/lib/db";

// See app/api/games/route.ts for why this is needed — otherwise Next.js
// freezes this response at build time instead of querying fresh each time.
export const dynamic = "force-dynamic";

export async function GET() {
  const users = await getUsers();
  // Never send PINs to the client — just id/name for the picker.
  return NextResponse.json({ users: users.map((u) => ({ id: u.id, name: u.name })) });
}
