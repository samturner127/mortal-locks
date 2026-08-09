import { NextResponse } from "next/server";
import { getCurrentWeekId, getWeek, getWeekGames, getPicksForWeek } from "@/lib/db";

// Without this, Next.js statically prerenders this route at build time and
// serves that same cached response forever — meaning new picks/games would
// never show up in production without a redeploy.
export const dynamic = "force-dynamic";

export async function GET() {
  const weekId = await getCurrentWeekId();
  if (!weekId) {
    return NextResponse.json({ weekId: null, week: null, games: [], picks: [] });
  }
  const [week, games, picks] = await Promise.all([
    getWeek(weekId),
    getWeekGames(weekId),
    getPicksForWeek(weekId),
  ]);
  return NextResponse.json({ weekId, week, games, picks });
}
