// Usage: node scripts/seed-users.mjs
// Edit the FRIENDS list below, then run once after schema.sql has been applied.
import pg from "pg";
import "dotenv/config";

const FRIENDS = [
  { name: "Tuna", pin: "1001" },
  { name: "Parry", pin: "1002" },
  { name: "Cam", pin: "1003" },
  { name: "Gabe", pin: "1004" },
  { name: "Stew", pin: "1005" },
  { name: "Bart", pin: "1006" },
  { name: "Kyle", pin: "1007" },
  { name: "White Kyle", pin: "1008" },
  { name: "Max", pin: "1009" },
  { name: "Caleb", pin: "1010" },
  { name: "Glass", pin: "1011" },
  { name: "Neek", pin: "1012" },
  { name: "Jimmy", pin: "1013" },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

for (const f of FRIENDS) {
  await pool.query(
    `insert into users (name, pin) values ($1, $2)
     on conflict (name) do update set pin = excluded.pin`,
    [f.name, f.pin]
  );
  console.log(`✓ ${f.name}`);
}

await pool.end();
