import { NextResponse } from "next/server";
import { getCurrentWeekId, getWeek, getWeekGames, getPicksForWeek } from "@/lib/db";

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
