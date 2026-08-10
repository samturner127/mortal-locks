import { NextResponse } from "next/server";
import { getHistoryGrid } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await getHistoryGrid();
  return NextResponse.json({ entries });
}
