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
  const { rows } = await pool.query<Week>(`select * from weeks where id = $1`, [weekId]);
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

export async function getWeekGames(weekId: number): Promise<Game[]> {
  const { rows } = await pool.query<Game>(
    `select * from games where week_id = $1 order by commence_time asc`,
    [weekId]
  );
  return rows;
}

/** Games in this week that haven't kicked off yet — candidates for an auto-pick. */
export async function getRemainingGamesForWeek(weekId: number): Promise<Game[]> {
  const { rows } = await pool.query<Game>(
    `select * from games where week_id = $1 and commence_time > now() order by commence_time asc`,
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
     order by u.name asc`,
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

export async function upsertPick(params: {
  userId: number;
  weekId: number;
  gameId: number;
  pickType: "spread" | "total";
  pickedSide: "home" | "away" | "over" | "under";
  lockedLine: number;
  isDoubleDown: boolean;
}) {
  const { userId, weekId, gameId, pickType, pickedSide, lockedLine, isDoubleDown } = params;
  await pool.query(
    `insert into picks (user_id, week_id, game_id, pick_type, picked_side, locked_line, is_double_down, is_auto_pick)
     values ($1, $2, $3, $4, $5, $6, $7, false)
     on conflict (user_id, week_id)
     do update set
       game_id = $3, pick_type = $4, picked_side = $5, locked_line = $6,
       is_double_down = $7, is_auto_pick = false, updated_at = now()`,
    [userId, weekId, gameId, pickType, pickedSide, lockedLine, isDoubleDown]
  );
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

export async function getStandings(): Promise<
  {
    name: string;
    wins: number;
    losses: number;
    pushes: number;
    double_down_spent: boolean;
    rank: number;
  }[]
> {
  const { rows } = await pool.query(
    `with agg as (
       select u.id, u.name,
         coalesce(sum(case when p.result='win'  then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as wins,
         coalesce(sum(case when p.result='loss' then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as losses,
         coalesce(sum(case when p.result='push' then (case when p.is_double_down then 2 else 1 end) else 0 end),0)::int as pushes,
         bool_or(p.is_double_down) as double_down_spent
       from users u
       left join picks p on p.user_id = u.id and p.result is not null
       group by u.id, u.name
     )
     select name, wins, losses, pushes, double_down_spent,
            rank() over (order by wins desc, pushes desc, losses asc) as rank
     from agg
     order by rank asc, name asc`
  );
  return rows;
}
