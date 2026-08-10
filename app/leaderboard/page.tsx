"use client";

import { useEffect, useState } from "react";

type Row = {
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  double_down_spent: boolean;
  auto_pick_count: number;
  rank: number;
  is_champion: boolean;
  is_last: boolean;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setRows(d.standings));
  }, []);

  return (
    <div>
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest2 text-amber uppercase">Mortal Locks</p>
          <h1 className="font-display text-2xl font-semibold">Standings</h1>
        </div>
        <div className="flex gap-4 text-sm">
          <a href="/history" className="text-mute hover:text-ink transition">
            History
          </a>
          <a href="/" className="text-mute hover:text-ink transition">
            This week
          </a>
        </div>
      </header>

      <div className="bg-panel border border-panelLine rounded-2xl shadow-board overflow-hidden">
        {rows === null && <p className="p-6 text-mute font-mono text-sm">Loading standings…</p>}
        {rows?.map((r, i) => {
          const tied = rows.some((other, j) => j !== i && other.rank === r.rank);
          return (
            <div
              key={r.name}
              className="flex items-center justify-between px-6 py-4 border-b border-panelLine last:border-0"
            >
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-mute w-8">
                  {tied ? `T-${r.rank}` : r.rank}
                </span>
                <span className="font-display text-lg">{r.name}</span>
                {r.is_champion && <span title="In first">👑</span>}
                {r.is_last && <span title="In last — refund territory">🚽</span>}
                {r.auto_pick_count > 0 && (
                  <span title={`Missed the deadline ${r.auto_pick_count}x`}>
                    {"💀".repeat(r.auto_pick_count)}
                  </span>
                )}
                {r.double_down_spent && (
                  <span className="font-mono text-[10px] tracking-widest2 uppercase text-loss/80 border border-loss/40 rounded px-1.5 py-0.5">
                    DD spent
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 font-mono text-sm">
                <Stat label="W" value={r.wins} className="text-teal" />
                <Stat label="L" value={r.losses} className="text-loss" />
                <Stat label="P" value={r.pushes} className="text-mute" />
              </div>
            </div>
          );
        })}
        {rows?.length === 0 && <p className="p-6 text-mute text-sm">No graded weeks yet.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className="text-right">
      <span className={"text-lg " + className}>{value}</span>
      <span className="text-mute text-xs ml-1">{label}</span>
    </span>
  );
}
