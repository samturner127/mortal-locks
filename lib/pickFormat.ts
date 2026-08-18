import { abbreviateTeam } from "@/lib/teamAbbreviations";

export function formatSpread(v: number) {
  return v > 0 ? `+${v}` : String(v);
}

type AbbreviatablePick = {
  home_team: string;
  away_team: string;
  pick_type: "spread" | "total";
  picked_side: "home" | "away" | "over" | "under";
  locked_line: number;
};

/** e.g. "CHI +4" for a spread, "NYG O 42.5" for a total. */
export function describePickAbbrev(pick: AbbreviatablePick): string {
  if (pick.pick_type === "spread") {
    const team = pick.picked_side === "home" ? pick.home_team : pick.away_team;
    return `${abbreviateTeam(team)} ${formatSpread(pick.locked_line)}`;
  }
  const homeAbbrev = abbreviateTeam(pick.home_team);
  const side = pick.picked_side === "over" ? "O" : "U";
  return `${homeAbbrev} ${side} ${pick.locked_line}`;
}
