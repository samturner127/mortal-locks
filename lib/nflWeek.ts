/**
 * Computes an NFL week's pick-submission window (Mon 10pm PT open, Sun 10am
 * PT close) from any single game's kickoff time, using the IANA zone
 * `America/Los_Angeles` so the window is correct across the PDT/PST
 * transition in November — no hardcoded UTC offset.
 */

const LA_TZ = "America/Los_Angeles";

type DateParts = { year: number; month: number; day: number };

function getLosAngelesDateParts(d: Date): DateParts & { weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayNames.indexOf(get("weekday")),
  };
}

function addDays(parts: DateParts, n: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Converts a wall-clock time in `timeZone` to the correct UTC instant,
 * DST-aware. Standard "double conversion" trick: guess UTC equals the wall
 * clock, ask Intl what that guess reads as in the target zone, then correct
 * by the observed offset.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);

  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const diff = utcGuess.getTime() - asIfUtc;
  return new Date(utcGuess.getTime() + diff);
}

/** The Sunday (LA calendar date) belonging to the same NFL week as this kickoff. */
function nflWeekSundayParts(commenceTimeIso: string): DateParts {
  const { year, month, day, weekday } = getLosAngelesDateParts(new Date(commenceTimeIso));
  if (weekday === 0) return { year, month, day }; // already Sunday
  if (weekday === 1) return addDays({ year, month, day }, -1); // Monday -> yesterday's Sunday
  return addDays({ year, month, day }, (7 - weekday) % 7); // Tue..Sat -> upcoming Sunday
}

export function computeNflWeek(commenceTimeIso: string): {
  season: number;
  weekNumber: number;
  opensAt: Date;
  closesAt: Date;
} {
  const sunday = nflWeekSundayParts(commenceTimeIso);
  const closesAt = zonedTimeToUtc(sunday.year, sunday.month, sunday.day, 10, 0, LA_TZ);
  const monday = addDays(sunday, -6); // Monday of the preceding calendar week
  const opensAt = zonedTimeToUtc(monday.year, monday.month, monday.day, 22, 0, LA_TZ);
  const sundayNoonUtc = new Date(Date.UTC(sunday.year, sunday.month - 1, sunday.day, 12));
  return { season: sunday.year, weekNumber: getISOWeek(sundayNoonUtc), opensAt, closesAt };
}

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
