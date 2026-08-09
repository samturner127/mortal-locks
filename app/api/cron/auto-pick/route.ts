import { NextResponse } from "next/server";
import {
  getUsersMissingPickForClosedWeeks,
  getRemainingGamesForWeek,
  insertAutoPick,
} from "@/lib/db";
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
