import { NextResponse } from "next/server";
import {
  getUsersMissingPickForClosedWeeks,
  getRemainingGamesForWeek,
  insertAutoPick,
  refreshGameLines,
} from "@/lib/db";
import { fetchWeekGames } from "@/lib/oddsApi";
import { collectSpreadCandidates, chooseBiggestUnderdog } from "@/lib/autoPick";

// Sweeps for anyone who missed the weekly deadline and auto-assigns them the
// biggest remaining underdog, line flipped. Idempotent — safe to run any
// number of times. Called daily by a scheduler (see vercel.json); a no-op on
// days when no week's cutoff has just passed. Also safe to hit by hand.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = await getUsersMissingPickForClosedWeeks();

  // Pull live lines before choosing, so the pick isn't made off whatever the
  // daily sync or the last lock-in happened to store hours earlier. Only
  // games still pregame come back from the feed, so a 10am game that has
  // already kicked off keeps its last pregame line rather than a live
  // in-game one. Skipped when nobody's missing a pick, which is most runs —
  // this cron fires daily and the odds API is metered.
  if (missing.length > 0) {
    try {
      await refreshGameLines(await fetchWeekGames());
    } catch {
      // Odds API hiccup -- fall back to the stored lines rather than leave
      // the missed picks unassigned until tomorrow's run.
    }
  }

  const byWeek = new Map<number, number[]>();
  for (const m of missing) byWeek.set(m.weekId, [...(byWeek.get(m.weekId) ?? []), m.userId]);

  let assigned = 0;
  for (const [weekId, userIds] of byWeek) {
    const remaining = await getRemainingGamesForWeek(weekId);
    const chosen = chooseBiggestUnderdog(collectSpreadCandidates(remaining));
    if (!chosen) continue; // no remaining games left in this week to flip into a pick

    for (const userId of userIds) {
      const inserted = await insertAutoPick({
        userId,
        weekId,
        gameId: chosen.gameId,
        pickedSide: chosen.side,
        lockedLine: -chosen.spread,
      });
      if (inserted) assigned++;
    }
  }

  return NextResponse.json({ ok: true, assigned });
}
