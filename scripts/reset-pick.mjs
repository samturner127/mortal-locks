// Usage: node scripts/reset-pick.mjs <name>
// Local-only testing helper: deletes that user's pick for whatever week the
// app currently considers "current" (same logic as lib/db.ts::getCurrentWeekId).
// Picks are permanent in the app itself once submitted — this script exists
// so you can re-test the pick flow without waiting for a new week.
import pg from "pg";
import "dotenv/config";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/reset-pick.mjs <name>");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: userRows } = await pool.query("select id from users where name = $1", [name]);
if (userRows.length === 0) {
  console.error(`No user named "${name}".`);
  await pool.end();
  process.exit(1);
}
const userId = userRows[0].id;

const { rows: openRows } = await pool.query(
  `select id from weeks where pick_opens_at <= now() and pick_closes_at > now()
   order by pick_opens_at desc limit 1`
);
const { rows: closedRows } = await pool.query(
  `select id from weeks where pick_closes_at <= now()
   order by pick_closes_at desc limit 1`
);
const { rows: upcomingRows } = await pool.query(
  `select id from weeks where pick_opens_at > now()
   order by pick_opens_at asc limit 1`
);
const weekId = openRows[0]?.id ?? closedRows[0]?.id ?? upcomingRows[0]?.id;

if (!weekId) {
  console.error("No current week found.");
  await pool.end();
  process.exit(1);
}

const { rowCount } = await pool.query("delete from picks where user_id = $1 and week_id = $2", [userId, weekId]);
console.log(
  rowCount > 0
    ? `✓ Reset ${name}'s pick for week ${weekId}.`
    : `${name} had no pick for week ${weekId} — nothing to reset.`
);

await pool.end();
