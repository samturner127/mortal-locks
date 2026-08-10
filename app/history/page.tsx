"use client";

import { useEffect, useMemo, useState } from "react";
import { abbreviateTeam } from "@/lib/teamAbbreviations";

type Entry = {
  week_id: number;
  pick_opens_at: string;
  user_id: number;
  name: string;
  pick_type: "spread" | "total" | null;
  picked_side: "home" | "away" | "over" | "under" | null;
  locked_line: number | null;
  result: "win" | "loss" | "push" | null;
  is_auto_pick: boolean | null;
  home_team: string | null;
  away_team: string | null;
};

// Columns beyond the 18-week regular season are the playoffs, in order.
const PLAYOFF_LABELS = ["WC", "DIV", "CONF", "SB"];

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries));
  }, []);

  const { weeks, players, grid } = useMemo(() => {
    if (!entries) return { weeks: [] as number[], players: [] as { id: number; name: string }[], grid: new Map<string, Entry>() };

    const weekIds: number[] = [];
    const seenWeeks = new Set<number>();
    const playerMap = new Map<number, string>();
    const g = new Map<string, Entry>();

    for (const e of entries) {
      if (!seenWeeks.has(e.week_id)) {
        seenWeeks.add(e.week_id);
        weekIds.push(e.week_id);
      }
      playerMap.set(e.user_id, e.name);
      g.set(`${e.user_id}:${e.week_id}`, e);
    }

    const playerList = Array.from(playerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { weeks: weekIds, players: playerList, grid: g };
  }, [entries]);

  function weekLabel(index: number) {
    if (index < 18) return `Wk ${index + 1}`;
    return PLAYOFF_LABELS[index - 18] ?? `Wk ${index + 1}`;
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest2 text-amber uppercase">Mortal Locks</p>
          <h1 className="font-display text-2xl font-semibold">History</h1>
        </div>
        <div className="flex gap-4 text-sm">
          <a href="/leaderboard" className="text-mute hover:text-ink transition">
            Leaderboard
          </a>
          <a href="/" className="text-mute hover:text-ink transition">
            This week
          </a>
        </div>
      </header>

      <div className="bg-panel border border-panelLine rounded-2xl shadow-board overflow-hidden">
        {entries === null && <p className="p-6 text-mute font-mono text-sm">Loading history…</p>}
        {entries !== null && weeks.length === 0 && (
          <p className="p-6 text-mute text-sm">No weeks yet.</p>
        )}
        {weeks.length > 0 && (
          <div className="overflow-x-auto">
            <table className="border-collapse w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel px-4 py-3 text-left font-mono text-[10px] tracking-widest2 text-mute uppercase border-b border-r border-panelLine">
                    Player
                  </th>
                  {weeks.map((weekId, i) => (
                    <th
                      key={weekId}
                      className="px-3 py-3 text-center font-mono text-[10px] tracking-widest2 text-mute uppercase border-b border-panelLine whitespace-nowrap"
                    >
                      {weekLabel(i)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id} className="border-b border-panelLine last:border-0">
                    <td className="sticky left-0 bg-panel px-4 py-2 font-display text-sm border-r border-panelLine whitespace-nowrap">
                      {player.name}
                    </td>
                    {weeks.map((weekId) => {
                      const entry = grid.get(`${player.id}:${weekId}`);
                      return (
                        <td key={weekId} className="px-1 py-2 text-center">
                          <PickCell entry={entry} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PickCell({ entry }: { entry: Entry | undefined }) {
  if (!entry || !entry.pick_type) {
    return <span className="text-mute text-xs">—</span>;
  }

  const label = describePickAbbrev(entry);
  const resultClass =
    entry.result === "win"
      ? "bg-teal/10 text-teal"
      : entry.result === "loss"
      ? "bg-loss/10 text-loss"
      : entry.result === "push"
      ? "bg-mute/10 text-mute"
      : "text-ink";

  return (
    <span className={"inline-block px-2 py-1 rounded font-mono text-xs whitespace-nowrap " + resultClass}>
      {label}
    </span>
  );
}

function formatSpread(v: number) {
  return v > 0 ? `+${v}` : String(v);
}

function describePickAbbrev(entry: Entry): string {
  if (entry.pick_type === "spread") {
    const team = entry.picked_side === "home" ? entry.home_team! : entry.away_team!;
    return `${abbreviateTeam(team)} ${formatSpread(entry.locked_line!)}`;
  }
  // total
  const homeAbbrev = abbreviateTeam(entry.home_team!);
  const side = entry.picked_side === "over" ? "O" : "U";
  return `${homeAbbrev} ${side} ${entry.locked_line}`;
}
