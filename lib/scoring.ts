export type PickType = "spread" | "total";
export type PickedSide = "home" | "away" | "over" | "under";
export type Result = "win" | "loss" | "push";

export type GradedPick = { result: Result };

/**
 * Grades a single pick against the final score. A double down doesn't change
 * the result — it just doubles whichever bucket (win/loss/push) the result
 * falls into, which is applied at standings-aggregation time (see
 * lib/db.ts::getStandings), not here.
 */
export function gradePick(
  pickType: PickType,
  pickedSide: PickedSide,
  lockedLine: number,
  homeScore: number,
  awayScore: number
): GradedPick {
  return { result: determineResult(pickType, pickedSide, lockedLine, homeScore, awayScore) };
}

function determineResult(
  pickType: PickType,
  pickedSide: PickedSide,
  lockedLine: number,
  homeScore: number,
  awayScore: number
): Result {
  if (pickType === "spread") {
    // lockedLine is the spread for the side the user picked (e.g. -3.5 for a
    // favorite, +3.5 for an underdog), matching how DraftKings displays it.
    if (pickedSide === "home") {
      const adjusted = homeScore + lockedLine;
      if (adjusted === awayScore) return "push";
      return adjusted > awayScore ? "win" : "loss";
    } else {
      const adjusted = awayScore + lockedLine;
      if (adjusted === homeScore) return "push";
      return adjusted > homeScore ? "win" : "loss";
    }
  }

  // total
  const total = homeScore + awayScore;
  if (total === lockedLine) return "push";
  if (pickedSide === "over") return total > lockedLine ? "win" : "loss";
  return total < lockedLine ? "win" : "loss"; // under
}
