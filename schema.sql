-- Mortal Locks schema. Run once against your Postgres database
-- (Supabase, Neon, Vercel Postgres, or local) before first use.

create table if not exists users (
  id serial primary key,
  name text unique not null,
  pin text not null,                 -- simple 4-digit PIN, not a real password
  created_at timestamptz not null default now()
);
-- Note: whether a user's season-long double down is "spent" is derived from
-- picks (any row with is_double_down = true on a different week), not stored
-- on the user — spent the instant it's used, win, loss, or push.

create table if not exists weeks (
  id serial primary key,
  season int not null,
  week_number int not null,
  -- This week's submission window: Mon 10pm PT open, Sun 10am PT close,
  -- computed once at sync time off the week's games (see lib/nflWeek.ts)
  -- and never recomputed.
  pick_opens_at timestamptz not null,
  pick_closes_at timestamptz not null,
  unique (season, week_number),
  check (pick_opens_at < pick_closes_at)
);

create table if not exists games (
  id serial primary key,
  week_id int not null references weeks(id) on delete cascade,
  external_id text unique,           -- id from the odds provider, for re-syncing
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  home_spread numeric,               -- DraftKings line, e.g. -3.5 for the favorite
  away_spread numeric,
  total numeric,                     -- DraftKings over/under line
  home_score int,
  away_score int,
  completed boolean not null default false,
  -- When this game's line was last refreshed from the live odds API — by
  -- either the daily sync or a lock-time freshness check (see
  -- /api/picks/check-line). Null means never checked since that feature
  -- shipped, which always triggers a fresh check.
  line_checked_at timestamptz
);

-- One bet per person per week, on any game in that week's slate.
create table if not exists picks (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  week_id int not null references weeks(id) on delete cascade,
  game_id int not null references games(id) on delete cascade,
  pick_type text not null check (pick_type in ('spread', 'total')),
  -- for spread: 'home' or 'away'. for total: 'over' or 'under'.
  picked_side text not null check (picked_side in ('home', 'away', 'over', 'under')),
  locked_line numeric not null,      -- the line at the moment they picked, so a later line move can't retroactively help/hurt
  is_double_down boolean not null default false,
  -- true if the system assigned this pick after the Sunday cutoff because
  -- the user missed it — see /api/cron/auto-pick.
  is_auto_pick boolean not null default false,
  result text check (result in ('win', 'loss', 'push')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_id),
  check (not (is_auto_pick and is_double_down))
);

create index if not exists idx_picks_week on picks(week_id);
create index if not exists idx_games_week on games(week_id);
