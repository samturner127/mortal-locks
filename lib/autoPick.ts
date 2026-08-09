/**
 * Selects the punitive auto-pick for anyone who misses the weekly deadline:
 * the biggest underdog among remaining games, line flipped.
 */

export type SpreadCandidate = { gameId: number; side: "home" | "away"; spread: number };

export function collectSpreadCandidates(
  games: { id: number; home_spread: number | string | null; away_spread: number | string | null }[]
): SpreadCandidate[] {
  const out: SpreadCandidate[] = [];
  for (const g of games) {
    // pg returns numeric columns as strings — Number() before comparing,
    // or "biggest" spread would sort lexicographically and pick wrong.
    if (g.home_spread !== null) out.push({ gameId: g.id, side: "home", spread: Number(g.home_spread) });
    if (g.away_spread !== null) out.push({ gameId: g.id, side: "away", spread: Number(g.away_spread) });
  }
  return out;
}

export function chooseBiggestUnderdog(
  candidates: SpreadCandidate[],
  rng: () => number = Math.random
): SpreadCandidate | null {
  if (candidates.length === 0) return null;
  const maxSpread = Math.max(...candidates.map((c) => c.spread));
  const tied = candidates.filter((c) => c.spread === maxSpread);
  return tied[Math.floor(rng() * tied.length)];
}
