import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { fetchWeekGames, fetchScores } from "@/lib/oddsApi";
import { gradePick } from "@/lib/scoring";
import { computeNflWeek } from "@/lib/nflWeek";

// Called weekly by a scheduler (see vercel.json). Also safe to hit by hand.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // 1. Grade any games that have finished since last sync. The Odds API's
  // /scores endpoint only accepts daysFrom of 1-3; a daily cron easily
  // covers any game that finished since the last run within that window.
  const scores = await fetchScores(3);
  let gamesGraded = 0;
  let picksGraded = 0;
  for (const s of scores) {
    if (!s.completed || s.homeScore === null || s.awayScore === null) continue;

    const { rows } = await pool.query(
      `update games
         set home_score = $1, away_score = $2, completed = true
       where external_id = $3 and completed = false
       returning id`,
      [s.homeScore, s.awayScore, s.externalId]
    );
    const updatedGame = rows[0];
    if (!updatedGame) continue;
    gamesGraded++;

    const { rows: picks } = await pool.query(
      `select id, pick_type, picked_side, locked_line
       from picks where game_id = $1`,
      [updatedGame.id]
    );
    for (const p of picks) {
      const graded = gradePick(p.pick_type, p.picked_side, Number(p.locked_line), s.homeScore, s.awayScore);
      await pool.query(`update picks set result = $1 where id = $2`, [graded.result, p.id]);
      picksGraded++;
    }
  }
  results.gamesGraded = gamesGraded;
  results.picksGraded = picksGraded;

  // 2. Pull in this week's full slate + DraftKings lines. Each game is
  // bucketed into its own real NFL week (rather than assuming the whole
  // batch belongs to one week) since the 8-day fetch window can straddle
  // two real weeks — e.g. a Monday-morning run still sees this week's MNF
  // game alongside next week's Thu-Sun slate.
  const weekGames = await fetchWeekGames();
  const weekIdCache = new Map<string, number>();
  let weeksSynced = new Set<string>();

  for (const g of weekGames) {
    const { season, weekNumber, opensAt, closesAt } = computeNflWeek(g.commenceTime);
    const cacheKey = `${season}:${weekNumber}`;
    let weekId = weekIdCache.get(cacheKey);
    if (weekId === undefined) {
      const { rows: weekRows } = await pool.query(
        `insert into weeks (season, week_number, pick_opens_at, pick_closes_at)
         values ($1, $2, $3, $4)
         on conflict (season, week_number) do update set season = excluded.season
         returning id`,
        [season, weekNumber, opensAt, closesAt]
      );
      weekId = weekRows[0].id as number;
      weekIdCache.set(cacheKey, weekId);
      weeksSynced.add(cacheKey);
    }

    await pool.query(
      `insert into games (week_id, external_id, home_team, away_team, commence_time, home_spread, away_spread, total)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (external_id) do update set
         week_id = excluded.week_id,
         home_spread = excluded.home_spread,
         away_spread = excluded.away_spread,
         total = excluded.total`,
      [weekId, g.externalId, g.homeTeam, g.awayTeam, g.commenceTime, g.homeSpread, g.awaySpread, g.total]
    );
  }
  results.weeksSynced = weekGames.length > 0 ? Array.from(weeksSynced) : [];
  results.gamesInSlate = weekGames.length;

  return NextResponse.json({ ok: true, ...results });
}
