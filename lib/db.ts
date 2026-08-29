import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") global._pgPool = pool;

export type User = { id: number; name: string; pin: string };

export type Week = {
  id: number;
  season: number;
  week_number: number;
  pick_opens_at: string;
  pick_closes_at: string;
  /**
   * 1-based position among all weeks, in kickoff order — the pool's own
   * week count, not the NFL's. `week_number` comes from computeNflWeek and
   * carries the real calendar week (35 during preseason), which isn't what
   * anyone in the group counts by. Ordered by pick_opens_at to match the
   * Lock Log's columns, so "Week 3" here and "Wk 3" there are the same week.
   */
  ordinal: number;
};

export type Game = {
  id: number;
  week_id: number;
  external_id: string | null;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_spread: number | null;
  away_spread: number | null;
  total: number | null;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
  line_checked_at: string | null;
};

export type Pick = {
  id: number;
  user_id: number;
  week_id: number;
  game_id: number;
  pick_type: "spread" | "total";
  picked_side: "home" | "away" | "over" | "under";
  locked_line: number;
  is_double_down: boolean;
  is_auto_pick: boolean;
  result: "win" | "loss" | "push" | null;
};

export async function getUsers(): Promise<User[]> {
  const { rows } = await pool.query<User>(`select id, name, pin from users order by name asc`);
  return rows;
}

export async function getUserById(id: number): Promise<User | null> {
  const { rows } = await pool.query<User>(`select * from users where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getWeek(weekId: number): Promise<Week | null> {
  const { rows } = await pool.query<Week>(
    `select w.*,
            (select count(*)::int from weeks w2 where w2.pick_opens_at <= w.pick_opens_at) as ordinal
     from weeks w
     where w.id = $1`,
    [weekId]
  );
  return rows[0] ?? null;
}

/**
 * The current week: whichever week's pick window is open right now; if none
 * is open, the most recently closed week (so results/reveal stay visible
 * between Sunday's cutoff and the next Monday's open, and after the season
 * ends); if none has closed yet either, the soonest upcoming week (so a
 * countdown can show before the season's first window opens).
 */
export async function getCurrentWeekId(): Promise<number | null> {
  const open = await pool.query(
    `select id from weeks where pick_opens_at <= now() and pick_closes_at > now()
     order by pick_opens_at desc limit 1`
  );
  if (open.rows[0]) return open.rows[0].id;

  const closed = await pool.query(
    `select id from weeks where pick_closes_at <= now()
     order by pick_closes_at desc limit 1`
  );
  if (closed.rows[0]) return closed.rows[0].id;

  const upcoming = await pool.query(
    `select id from weeks where pick_opens_at > now()
     order by pick_opens_at asc limit 1`
  );
  return upcoming.rows[0]?.id ?? null;
}

/**
 * This week's slate, excluding anything with no DraftKings line on any
 * market. `fetchWeekGames` already filters those at ingest, but this is the
 * backstop that also retires rows written before that filter existed (and
 * any game the provider later blanks out).
 *
 * Safe to filter here even though this backs pick submission as well as
 * display: a pick can't exist on a game with no lines, since /api/picks
 * refuses to store a null locked_line.
 */
export async function getWeekGames(weekId: number): Promise<Game[]> {
  const { rows } = await pool.query<Game>(
    `select * from games
     where week_id = $1
       and (home_spread is not null or away_spread is not null or total is not null)
     order by commence_time asc`,
    [weekId]
  );
  return rows;
}

export async function getGameById(gameId: number): Promise<Game | null> {
  const { rows } = await pool.query<Game>(`select * from games where id = $1`, [gameId]);
  return rows[0] ?? null;
}

/**
 * Refreshes stored lines for games already in the DB, from a freshly-fetched
 * odds batch. Narrower than the sync-week upsert on purpose — no week
 * bucketing, no inserting new games/weeks, just updates lines + the
 * freshness timestamp on rows that already exist (matched by external_id).
 */
export async function refreshGameLines(
  weekGames: { externalId: string; homeSpread: number | null; awaySpread: number | null; total: number | null }[]
): Promise<void> {
  for (const g of weekGames) {
    await pool.query(
      `update games set home_spread = $1, away_spread = $2, total = $3, line_checked_at = now()
       where external_id = $4`,
      [g.homeSpread, g.awaySpread, g.total, g.externalId]
    );
  }
}

/**
 * Games in this week that hadn't kicked off as of the week's own pick
 * deadline — candidates for an auto-pick. Anchored to the week's
 * pick_closes_at rather than the current time, since the sweep's cron can
 * fire up to ~90 minutes after the real cutoff (Vercel Hobby only allows
 * daily schedules); using "now" at sweep time would wrongly exclude the
 * early Sunday slate, which always kicks off at the exact same instant as
 * the cutoff (1pm ET = 10am PT). The comparison is inclusive for the same
 * reason — a game starting exactly at the cutoff still counts as remaining.
 */
export async function getRemainingGamesForWeek(weekId: number): Promise<Game[]> {
  const { rows } = await pool.query<Game>(
    `select g.* from games g
     join weeks w on w.id = g.week_id
     where g.week_id = $1 and g.commence_time >= w.pick_closes_at
     order by g.commence_time asc`,
    [weekId]
  );
  return rows;
}

export async function getUserPickForWeek(userId: number, weekId: number): Promise<Pick | null> {
  const { rows } = await pool.query<Pick>(
    `select * from picks where user_id = $1 and week_id = $2`,
    [userId, weekId]
  );
  return rows[0] ?? null;
}

export async function getPicksForWeek(
  weekId: number
): Promise<(Pick & { name: string; home_team: string; away_team: string; commence_time: string })[]> {
  const { rows } = await pool.query(
    `select p.*, u.name, g.home_team, g.away_team, g.commence_time
     from picks p
     join users u on u.id = p.user_id
     join games g on g.id = p.game_id
     where p.week_id = $1
     order by p.created_at asc`,
    [weekId]
  );
  return rows;
}

/**
 * True if this user has a double-down pick locked in on some week OTHER than
 * the one they're currently editing. Spent the instant it's used — win,
 * loss, or push all count.
 */
export async function hasDoubleDownElsewhere(userId: number, excludingWeekId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from picks
     where user_id = $1 and is_double_down = true and week_id != $2
     limit 1`,
    [userId, excludingWeekId]
  );
  return rows.length > 0;
}

/** Users with no pick for a week whose submission window has already closed. */
export async function getUsersMissingPickForClosedWeeks(): Promise<{ userId: number; weekId: number }[]> {
  const { rows } = await pool.query(
    `select u.id as "userId", w.id as "weekId"
     from users u
     cross join weeks w
     left join picks p on p.user_id = u.id and p.week_id = w.id
     where w.pick_closes_at <= now() and p.id is null`
  );
  return rows;
}

/**
 * Inserts a user's pick for a week. Picks are permanent once submitted — no
 * updates, ever — so this is insert-only with `on conflict do nothing`, and
 * returns whether the row was actually inserted (false means they already
 * had a pick, including a race between two near-simultaneous submissions).
 */
export async function insertPick(params: {
  userId: number;
  weekId: number;
  gameId: number;
  pickType: "spread" | "total";
  pickedSide: "home" | "away" | "over" | "under";
  lockedLine: number;
  isDoubleDown: boolean;
}): Promise<boolean> {
  const { userId, weekId, gameId, pickType, pickedSide, lockedLine, isDoubleDown } = params;
  const { rows } = await pool.query(
    `insert into picks (user_id, week_id, game_id, pick_type, picked_side, locked_line, is_double_down, is_auto_pick)
     values ($1, $2, $3, $4, $5, $6, $7, false)
     on conflict (user_id, week_id) do nothing
     returning id`,
    [userId, weekId, gameId, pickType, pickedSide, lockedLine, isDoubleDown]
  );
  return rows.length > 0;
}

/** Assigns the punitive auto-pick for a user who missed the deadline. Returns false if a pick already existed. */
export async function insertAutoPick(params: {
  userId: number;
  weekId: number;
  gameId: number;
  pickedSide: "home" | "away";
  lockedLine: number;
}): Promise<boolean> {
  const { rows } = await pool.query(
    `insert into picks (user_id, week_id, game_id, pick_type, picked_side, locked_line, is_double_down, is_auto_pick)
     values ($1, $2, $3, 'spread', $4, $5, false, true)
     on conflict (user_id, week_id) do nothing
     returning id`,
    [params.userId, params.weekId, params.gameId, params.pickedSide, params.lockedLine]
  );
  return rows.length > 0;
}

/**
 * Standings, plus who's clearly in first (crown) and clearly in last
 * (toilet, since last place gets a refund). Last place is ranked by most
 * losses / most pushes / fewest wins, but deliberately excluding auto-picks
 * entirely from that calculation: once someone's mathematically eliminated,
 * the easiest way to "tank" for the refund would be to just stop
 * submitting and let the punitive auto-pick (guaranteed near-loss) pile up
 * losses for them. Excluding auto-picks from the last-place math removes
 * that shortcut — missing the deadline neither helps nor hurts your case
 * for being in last, so getting there requires actually playing (and
 * genuinely losing). Auto-picks still count fully against you in the
 * normal (first-place) standings, unchanged — the punishment for missing a
 * deadline is real, it just can't double as a strategy for last place.
 * Each auto-pick also surfaces as `auto_pick_count` for a skull-per-miss
 * indicator. `is_champion`/`is_last` are only true when that position is
 * held outright — a full tie through all three tiebreakers suppresses both.
 */
export async function getStandings(): Promise<
  {
    id: number;
    name: string;
    wins: number;
    losses: number;
    pushes: number;
    double_down_spent: boolean;
    auto_pick_count: number;
    rank: number;
    is_champion: boolean;
    is_last: boolean;
  }[]
> {
  const { rows } = await pool.query(
    `with agg as (
       select u.id, u.name,
         coalesce(sum(case when p.result='win'  then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as wins,
         coalesce(sum(case when p.result='loss' then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as losses,
         coalesce(sum(case when p.result='push' then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as pushes,
         bool_or(p.is_double_down) as double_down_spent,
         coalesce(sum(case when p.is_auto_pick then 1 else 0 end),0)::int as auto_pick_count,
         coalesce(sum(case when p.result='win'  and not p.is_auto_pick then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as wins_excl_auto,
         coalesce(sum(case when p.result='loss' and not p.is_auto_pick then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as losses_excl_auto,
         coalesce(sum(case when p.result='push' and not p.is_auto_pick then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as pushes_excl_auto
       from users u
       left join picks p on p.user_id = u.id and p.result is not null
       group by u.id, u.name
     ),
     ranked as (
       select *,
         rank() over (order by wins desc, pushes desc, losses asc) as rank,
         rank() over (order by losses_excl_auto desc, pushes_excl_auto desc, wins_excl_auto asc) as last_rank
       from agg
     )
     select id, name, wins, losses, pushes, double_down_spent, auto_pick_count, rank,
       (rank = 1 and (select count(*) from ranked r2 where r2.rank = 1) = 1) as is_champion,
       (last_rank = 1 and (select count(*) from ranked r2 where r2.last_rank = 1) = 1) as is_last
     from ranked
     order by rank asc, name asc`
  );
  return rows;
}

export type HistoryEntry = {
  week_id: number;
  pick_opens_at: string;
  user_id: number;
  name: string;
  pick_type: "spread" | "total" | null;
  picked_side: "home" | "away" | "over" | "under" | null;
  locked_line: number | null;
  result: "win" | "loss" | "push" | null;
  is_auto_pick: boolean | null;
  is_double_down: boolean | null;
  home_team: string | null;
  away_team: string | null;
};

/**
 * Every user's pick for every week that's ever existed, chronologically —
 * the raw data behind the /history grid (weeks as columns, players as
 * rows). One row per (week, user) pair, including users with no pick yet
 * for a given week (left join), so the grid can render a blank cell rather
 * than skipping them.
 */
export async function getHistoryGrid(): Promise<HistoryEntry[]> {
  const { rows } = await pool.query<HistoryEntry>(
    `select w.id as week_id, w.pick_opens_at,
            u.id as user_id, u.name,
            p.pick_type, p.picked_side, p.locked_line, p.result, p.is_auto_pick, p.is_double_down,
            g.home_team, g.away_team
     from weeks w
     cross join users u
     left join picks p on p.user_id = u.id and p.week_id = w.id
     left join games g on g.id = p.game_id
     order by w.pick_opens_at asc, u.name asc`
  );
  return rows;
}
