import { NextResponse } from "next/server";
import { getGameById, refreshGameLines } from "@/lib/db";
import { fetchWeekGames } from "@/lib/oddsApi";
import { checkRateLimit, clientIp, CHECK_LINE_REQUESTS, ODDS_FETCH_BUDGET } from "@/lib/rateLimit";

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

  // Unauthenticated by design — it runs before anyone's identity matters, on
  // the click that opens the confirmation. That also makes it the one
  // endpoint a stranger can use to spend money, so it's capped twice: per
  // caller here, and globally on the live fetch below.
  const perIp = await checkRateLimit(`check-line:${clientIp(req)}`, CHECK_LINE_REQUESTS);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "Too many line checks — try again in a minute." },
      { status: 429, headers: { "Retry-After": String(perIp.retryAfterSeconds) } }
    );
  }

  let game = await getGameById(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const needsRefresh =
    !game.line_checked_at || Date.now() - new Date(game.line_checked_at).getTime() > FRESHNESS_WINDOW_MS;

  if (needsRefresh) {
    const budget = await checkRateLimit("check-line:odds-fetch", ODDS_FETCH_BUDGET);
    if (!budget.allowed) {
      // Day's allowance of live fetches is gone. Serve the stored lines
      // rather than erroring: a stale freshness check is a much smaller
      // problem than a drained monthly quota, which would take the crons
      // down with it.
      console.warn("check-line: daily odds-fetch budget spent, serving stored lines");
    } else {
      try {
        const weekGames = await fetchWeekGames();
        await refreshGameLines(weekGames);
        game = (await getGameById(gameId)) ?? game;
      } catch (err) {
        // Odds API hiccup -- fall back to whatever's already in the DB rather
        // than block someone from picking because a freshness check failed.
        // Logged because the silent version hid a spent API quota, which
        // looks identical from the outside: picks still work, they just
        // quietly stop being checked against live lines.
        console.error("check-line: live odds fetch failed, using stored lines", err);
      }
    }
  }

  const currentLine = resolveLine(game, pickType, pickedSide);
  const changed = currentLine !== null && Number(expectedLine) !== currentLine;

  return NextResponse.json({ changed, currentLine });
}
