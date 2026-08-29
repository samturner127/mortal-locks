/**
 * Naming for weeks past the 18-game regular season, which are the playoffs
 * in order. Shared so the slate heading and the Lock Log's columns can't
 * drift — they're the same weeks, just abbreviated differently to fit.
 */
const REGULAR_SEASON_WEEKS = 18;

const PLAYOFF_NAMES = ["Wild Card", "Divisional", "Conference", "Super Bowl"];
const PLAYOFF_ABBREVIATIONS = ["WC", "DIV", "CONF", "SB"];

/**
 * Column heading for the Lock Log grid, from a 0-based column index —
 * abbreviated to keep 20-odd columns narrow enough to scroll through.
 */
export function weekColumnLabel(index: number): string {
  if (index < REGULAR_SEASON_WEEKS) return `Wk ${index + 1}`;
  return PLAYOFF_ABBREVIATIONS[index - REGULAR_SEASON_WEEKS] ?? `Wk ${index + 1}`;
}

/**
 * Slate heading, from a 1-based week ordinal. Falls back to a plain week
 * count past the Super Bowl rather than throwing, so an unexpected extra
 * week can't blank the heading.
 */
export function weekTitle(ordinal: number): string {
  if (ordinal <= REGULAR_SEASON_WEEKS) return `Week ${ordinal}`;
  return PLAYOFF_NAMES[ordinal - REGULAR_SEASON_WEEKS - 1] ?? `Week ${ordinal}`;
}
