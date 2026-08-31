// Usage: node scripts/reset-season.mjs [--confirm]
//
// Wipes every pick, game and week so a new season starts from nothing.
// Without --confirm it only reports what it would delete, so you can eyeball
// the numbers before committing to it.
//
// Users are deliberately left alone — names and PINs survive, so nobody has
// to log in again. Everyone's double down comes back automatically: whether
// it's spent is derived from picks (see hasDoubleDownElsewhere in lib/db.ts),
// never stored on the user, so clearing picks restores it with nothing else
// to reset.
//
// Identities restart at 1, so the new season's week 1 really is id 1. That
// matters for display: the slate heading and the Lock Log columns are both
// positional (lib/weekLabels.ts), counted over whatever weeks exist — leaving
// the old weeks behind would make the season opener read "Week 4".
//
// After running this the app has no slate at all until the next sync:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-week
import pg from "pg";
import "dotenv/config";

const confirmed = process.argv.includes("--confirm");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: counts } = await pool.query(`
  select
    (select count(*) from picks)::int as picks,
    (select count(*) from games)::int as games,
    (select count(*) from weeks)::int as weeks,
    (select count(*) from users)::int as users,
    (select count(*) from picks where is_double_down)::int as double_downs
`);
const c = counts[0];

console.log("Current contents:");
console.log(`  picks         ${c.picks}   (${c.double_downs} double downs spent)`);
console.log(`  games         ${c.games}`);
console.log(`  weeks         ${c.weeks}`);
console.log(`  users         ${c.users}   <- kept`);

if (!confirmed) {
  console.log("\nDry run. Nothing was deleted.");
  console.log("Re-run with --confirm to delete every pick, game and week.");
  await pool.end();
  process.exit(0);
}

// One statement so it's a single transaction: either the whole season goes
// or none of it does. picks is listed explicitly rather than relying on
// cascade, so this fails loudly if the schema's foreign keys ever change.
await pool.query("truncate picks, games, weeks restart identity");

const { rows: after } = await pool.query(`
  select
    (select count(*) from picks)::int as picks,
    (select count(*) from games)::int as games,
    (select count(*) from weeks)::int as weeks,
    (select count(*) from users)::int as users
`);
const a = after[0];

console.log("\nDone.");
console.log(`  picks         ${a.picks}`);
console.log(`  games         ${a.games}`);
console.log(`  weeks         ${a.weeks}`);
console.log(`  users         ${a.users}   (kept)`);
console.log("\nNo slate exists until the next sync. Trigger one with:");
console.log('  curl -H "Authorization: Bearer $CRON_SECRET" <app-url>/api/cron/sync-week');

await pool.end();
