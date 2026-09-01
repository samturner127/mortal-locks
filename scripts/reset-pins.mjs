// Usage: node scripts/reset-pins.mjs [--confirm]
//
// Gives every user a fresh random 4-digit PIN and prints them once so they
// can be handed out. Without --confirm it only says what it would do.
//
// The PINs are printed here and stored in the database — deliberately never
// written to a file. This repo is public, so anything committed is readable
// by anyone; that's exactly why these are being rotated.
//
// Everyone's saved login breaks when this runs. Sessions are just
// { userId, name, pin } in localStorage (lib/session.ts) and /api/picks
// re-checks the PIN on every submit, so anyone still logged in gets
// "Name/PIN didn't match." until they log out and back in with the new one.
import { randomInt } from "node:crypto";
import pg from "pg";
import "dotenv/config";

const confirmed = process.argv.includes("--confirm");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: users } = await pool.query("select id, name from users order by name");

if (users.length === 0) {
  console.log("No users to update.");
  await pool.end();
  process.exit(0);
}

if (!confirmed) {
  console.log(`Would assign a new random PIN to ${users.length} users:`);
  for (const u of users) console.log(`  ${u.name}`);
  console.log("\nDry run. Nothing changed. Re-run with --confirm.");
  await pool.end();
  process.exit(0);
}

// Unique across the pool: you pick a name *and* type a PIN, so two people
// sharing one would let either sign in as the other. 1000-9999 rather than
// 0000-9999 so no PIN starts with a zero — nothing here parses them as
// numbers, but a leading zero is the kind of thing that gets dropped when
// someone types it into a group chat.
const pins = new Set();
while (pins.size < users.length) pins.add(String(randomInt(1000, 10000)));
const assigned = [...pins];

const client = await pool.connect();
try {
  await client.query("begin");
  for (let i = 0; i < users.length; i++) {
    await client.query("update users set pin = $1 where id = $2", [assigned[i], users[i].id]);
  }
  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  client.release();
}

const width = Math.max(...users.map((u) => u.name.length));
console.log("New PINs — hand these out, they are not stored anywhere else:\n");
for (let i = 0; i < users.length; i++) {
  console.log(`  ${users[i].name.padEnd(width)}  ${assigned[i]}`);
}
console.log("\nEveryone must log out and back in — saved logins carry the old PIN.");

await pool.end();
