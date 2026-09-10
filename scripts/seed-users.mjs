// Usage: node scripts/seed-users.mjs
// Edit the NAMES list below, then run to add anyone missing.
//
// No PINs here on purpose. This repo is public, so a PIN written into it is
// readable by anyone — new users get a random one, printed once on the way
// past. Use scripts/reset-pins.mjs to rotate everybody's.
import { randomInt } from "node:crypto";
import pg from "pg";
import "dotenv/config";

const NAMES = [
  "Tuna",
  "Parry",
  "Cam",
  "Gabe",
  "Stew",
  "Bart",
  "Kyle",
  "White Kyle",
  "Max",
  "Caleb",
  "Glass",
  "Neek",
  "Jimmy",
  "D Loo",
  "Bogner",
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const created = [];
for (const name of NAMES) {
  // do nothing, not do update: re-running this must never reset the PIN of
  // someone who already has one and is using it.
  const { rows } = await pool.query(
    `insert into users (name, pin) values ($1, $2)
     on conflict (name) do nothing
     returning id, pin`,
    [name, String(randomInt(1000, 10000))]
  );
  if (rows.length > 0) {
    created.push({ name, pin: rows[0].pin });
    console.log(`+ ${name}`);
  } else {
    console.log(`= ${name} (already there, PIN untouched)`);
  }
}

if (created.length > 0) {
  const width = Math.max(...created.map((c) => c.name.length));
  console.log("\nNew PINs — hand these out, they are not stored anywhere else:\n");
  for (const c of created) console.log(`  ${c.name.padEnd(width)}  ${c.pin}`);
}

await pool.end();
