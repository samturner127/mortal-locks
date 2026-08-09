import { NextResponse } from "next/server";
import { getGameById, refreshGameLines } from "@/lib/db";
import { fetchWeekGames } from "@/lib/oddsApi";

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

function resolveLine(
  game: { home_spread: number | null; away_spread: number | null; total: number | null },
  pickType: "spread" | "total",
  pickedSide: "home" | "away" | "over" | "under"
): number | null {
  if (pickType === "spread") {
    const v = pickedSide === "home" ? game.home_spread : game.away_spread;
    return v === null ? null : Number(v);
  }
  return game.total === null ? null : Number(game.total);
}

// Called right when someone clicks "Lock it in" -- a live freshness check so
// a late-breaking line move (e.g. an injury announcement) can't slip through
// the once-a-day sync. Reuses fetchWeekGames() (same API cost as a
// single-event lookup, but refreshes every game's line for that cost
// instead of just one) and skips the live call entirely if this game was
// checked within the last 5 minutes.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { gameId, pickType, pickedSide, expectedLine } = body ?? {};

  if (
    typeof gameId !== "number" ||
    (pickType !== "spread" && pickType !== "total") ||
    !["home", "away", "over", "under"].includes(pickedSide) ||
    typeof expectedLine !== "number"
  ) {
    return NextResponse.json({ error: "Invalid check-line payload." }, { status: 400 });
  }

  let game = await getGameById(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const needsRefresh =
    !game.line_checked_at || Date.now() - new Date(game.line_checked_at).getTime() > FRESHNESS_WINDOW_MS;

  if (needsRefresh) {
    try {
      const weekGames = await fetchWeekGames();
      await refreshGameLines(weekGames);
      game = (await getGameById(gameId)) ?? game;
    } catch {
      // Odds API hiccup -- fall back to whatever's already in the DB rather
      // than block someone from picking because a freshness check failed.
    }
  }

  const currentLine = resolveLine(game, pickType, pickedSide);
  const changed = currentLine !== null && Number(expectedLine) !== currentLine;

  return NextResponse.json({ changed, currentLine });
}
