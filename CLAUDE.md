# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mortal Locks — a score-prediction pool for a group chat. Each week everyone
picks one game from the NFL slate (a spread side or an over/under) before it
kicks off. See README.md for the full rule set (scoring, double-down,
push/refund behavior, per-game locking). The scoring rules are also encoded
directly in `lib/scoring.ts` and the schema comments in `schema.sql` — those
two files are the source of truth if the README and code ever disagree.

## Commands

```
npm install
npm run dev        # start Next.js dev server on localhost:3000
npm run build
npm run start       # serve a production build
npm run lint        # next lint
npm run db:init      # runs scripts/seed-users.mjs to (re)seed users from DATABASE_URL
```

There is no test suite in this repo.

### Local setup (from README)

1. Create a Postgres database, set `DATABASE_URL` in `.env` (copy from `.env.example`).
2. Apply schema: `psql $DATABASE_URL -f schema.sql`.
3. Set `ODDS_API_KEY` (free key from the-odds-api.com) and `CRON_SECRET` (any random string).
4. Edit `scripts/seed-users.mjs` with the group's names/PINs, then `npm run db:init`.
5. `npm run dev`, then trigger the first sync manually since nothing populates the slate until the cron runs:
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-week`

## Architecture

**Stack**: Next.js 14 App Router, plain `pg` (no ORM) against Postgres,
Tailwind for styling, client-side session in `localStorage` (no NextAuth/JWT).
All data fetching in pages is client-side `fetch` to the app's own API routes
under `app/api/*` — there are no server components doing direct DB reads.

**Data flow for a week**: `app/api/cron/sync-week/route.ts` is the only writer
of `games`/`weeks` data. On each run it (1) grades any previously-ungraded
games that have finished, by calling `fetchScores()` and running each of that
game's picks through `lib/scoring.ts::gradePick`, then (2) pulls the upcoming
slate via `fetchWeekGames()` and upserts into `games`/`weeks` keyed on the
odds provider's `external_id`. It's invoked daily by Vercel Cron
(`vercel.json`, Hobby-plan limited to daily) or can be hit by hand with the
`CRON_SECRET` bearer token. NFL weeks are approximated by an 8-day rolling
window in `fetchWeekGames()`, not calendar weeks — see the comment there
before changing that logic.

**`lib/oddsApi.ts`** is the only integration with the-odds-api.com (used
because DraftKings itself has no public API). If swapping providers, this
file's two exported shapes (`WeekGame`, `GameResult`) are the contract the
rest of the app depends on — nothing downstream needs to change if a new
provider is mapped into those shapes.

**`lib/db.ts`** holds every SQL query as a typed function; there's no
query-building layer, so add new queries here rather than inlining SQL in
route handlers. Notably, whether a user's season-long double-down is "spent"
is *derived* (`hasDoubleDownElsewhere`) from `picks` rows rather than stored
as a flag on `users` — this is intentional (see the comment in `schema.sql`)
so a push refund or a pre-kickoff pick change can't desync from a separately
stored flag. Keep that derivation, don't add a stored "spent" flag.

**Locking semantics**: a pick is only locked once its *specific* game kicks
off (checked against `commence_time` in `app/api/picks/route.ts`), not when
the week starts — other picks in the same week's slate remain open until
their own game's kickoff. `locked_line` is captured at pick time so a later
DraftKings line move can't retroactively change a graded result.

**Auth**: deliberately minimal — pick a name from `/api/users`, enter a
shared 4-digit PIN checked server-side in `app/api/picks/route.ts`. Session
is just `{ userId, name, pin }` in `localStorage` (`lib/session.ts`), with no
server session/cookie. This is intentional for a trusted group chat, not a
gap to "fix" with real auth unless asked.

**Scoring** (`lib/scoring.ts`): pure functions, no DB access — `gradePick`
takes a pick + final score and returns `{ result, points }`. Push always
scores 0 in both directions. Double-down doubles the win (+2) and *penalizes*
a loss (-1) rather than just scoring 0, per the README rules.
