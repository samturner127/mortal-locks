import { NextResponse } from "next/server";
import { getStandings } from "@/lib/db";

export async function GET() {
  const standings = await getStandings();
  return NextResponse.json({ standings });
}
