# Mortal Locks

A score-prediction pool for a group chat, built as a real app. Each week
everyone picks one game from the NFL slate — a spread side or an over/under —
before that game kicks off. Correct picks score, everyone gets one
season-long double down to swing for more.

## Rules, as built

- One pick per person per week, on any game in that week's slate.
- Pick type: a spread side (e.g. Bills −3.5) or a total (over/under).
- **Pick window**: submissions open Monday 10:00pm Pacific and close Sunday
  10:00am Pacific — a fixed weekly window (not tied to when any specific
  game kicks off), correct across the PDT/PST transition since it's computed
  in the `America/Los_Angeles` zone rather than a fixed UTC offset (see
  `lib/nflWeek.ts`). **A pick is permanent the instant you submit it** — no
  changing your mind, even earlier in the week while the window's still
  open.
- **Miss the window and you get auto-picked**: at the Sunday cutoff, anyone
  without a pick is assigned the biggest underdog among that week's
  still-remaining games, with the line flipped (e.g. Panthers +14 becomes an
  auto-pick of Panthers −14). Ties for biggest underdog are broken at
  random. Auto-picks are never a double down.
- Standings are a **W-L-P record**, not points. Season winner = most wins;
  tiebreak 1 = most pushes; tiebreak 2 = fewest losses; a full tie ends the
  season in a draw (split the pot).
- Double down (once per season, on any single pick) doubles whatever
  happens: a win counts as **2 wins**, a loss as **2 losses**, a push as
  **2 pushes**. It's spent the moment you use it — including on a push,
  there's no refund.
- Lines are locked in at the moment you pick, so a later line move can't
  retroactively help or hurt you.
- Picks are visible to the rest of the pool the instant they're submitted —
  no waiting for kickoff. A specific game still can't be picked once it's
  already started, independent of the week's overall submission window.

## How it works

- **Odds/scores**: DraftKings has no public API (only private B2B
  partnerships), so this uses [The Odds API](https://the-odds-api.com) —
  a free-tier aggregator that includes DraftKings among its bookmakers.
  See `lib/oddsApi.ts` if you'd rather swap in a different provider.
- **Data**: Postgres (works with Supabase, Neon, Vercel Postgres, or local).
- **Auth**: intentionally lightweight — pick your name, enter a shared PIN.
  Built for a trusted group chat, not a public product.
- **Sync**: `/api/cron/sync-week` grades any games that finished since the
  last run and pulls in the week's slate + DraftKings lines. Scheduled daily
  in `vercel.json` so scores get graded through the week, not just once.
- **Auto-pick**: `/api/cron/auto-pick` sweeps for anyone who missed the
  Sunday 10am Pacific deadline and assigns them the punitive underdog pick
  described above. Also scheduled daily (a no-op most days) — see
  "Deploying" for why it needs its own cron entry.

## Local setup

1. `npm install`
2. Create a Postgres database and set `DATABASE_URL` in `.env` (copy
   `.env.example`).
3. Apply the schema: `psql $DATABASE_URL -f schema.sql`
   (or paste `schema.sql` into your Supabase/Neon SQL editor).
4. Get a free key at the-odds-api.com and set `ODDS_API_KEY`.
5. Set `CRON_SECRET` to any random string.
6. Add your group: edit `scripts/seed-users.mjs`, then `npm run db:init`.
7. `npm run dev` and visit `http://localhost:3000`.
8. Trigger the first sync so there's a slate to pick from:
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-week`
9. Since picks are permanent once submitted, `npm run reset-pick -- <name>` is
   a local-only admin script for clearing your own test pick during
   development — it's not exposed anywhere in the app itself.

## Deploying

1. Push this repo to GitHub, import it into Vercel.
2. Add `DATABASE_URL`, `ODDS_API_KEY`, `CRON_SECRET` as Vercel env vars.
3. Vercel Cron on the Hobby plan only supports daily jobs, which is what
   `vercel.json` is set to for both `sync-week` (daily, grades games as they
   finish through the week) and `auto-pick` (daily at 18:30 UTC, ~30-90min
   after the real Sunday 10am Pacific cutoff depending on DST — a no-op on
   every other day of the week). If you want faster score grading, swap in a
   free external scheduler (cron-job.org) hitting the same URL with the
   `Authorization: Bearer <CRON_SECRET>` header instead.
4. Share the URL with the group chat.

## Extending it

- A `/history` page showing past weeks' results
- Multiple picks per week instead of one
- Moneyline picks alongside spread/total
- Real auth (NextAuth) if a shared PIN starts to feel too casual
- A group-chat text notification when someone submits a pick (raised as a
  want, not yet designed or built)
