/**
 * DraftKings has no public developer API — their odds data is only available
 * through private B2B partnerships. To get DraftKings' actual lines, we go
 * through The Odds API (https://the-odds-api.com), an aggregator that has a
 * free tier (500 requests/month) and includes DraftKings among its bookmakers.
 *
 * Swap this file out if you'd rather use a different aggregator (OddsJam,
 * OpticOdds, SharpAPI) — the rest of the app only depends on the shapes
 * returned by fetchWeekGames() and fetchScores() below.
 */

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl_preseason"; // TEMP: testing with live preseason games, revert to "americanfootball_nfl" before real use
const BASE = "https://api.the-odds-api.com/v4";

export type WeekGame = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  homeSpread: number | null;
  awaySpread: number | null;
  total: number | null;
};

export type GameResult = {
  externalId: string;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
};

function requireKey() {
  if (!API_KEY) {
    throw new Error(
      "ODDS_API_KEY is not set. Get a free key at https://the-odds-api.com and add it to your env."
    );
  }
}

/**
 * Pulls DraftKings lines for every upcoming NFL game within the next 8 days —
 * i.e. this week's slate. NFL weeks don't map cleanly to calendar weeks, so
 * this window (paired with the Tuesday cron run) is a practical stand-in:
 * it captures Thursday through Monday games without pulling in next week's.
 */
export async function fetchWeekGames(): Promise<WeekGame[]> {
  requireKey();
  const url = `${BASE}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=us&markets=spreads,totals&bookmakers=draftkings`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Odds API error ${res.status}: ${await res.text()}`);
  }
  const events = (await res.json()) as any[];

  const now = Date.now();
  const windowEnd = now + 8 * 24 * 60 * 60 * 1000;

  return events
    .filter((e) => {
      const t = new Date(e.commence_time).getTime();
      return t > now && t <= windowEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
    )
    .map((e) => {
      const dk = e.bookmakers?.find((b: any) => b.key === "draftkings");
      const spreadsMarket = dk?.markets?.find((m: any) => m.key === "spreads");
      const totalsMarket = dk?.markets?.find((m: any) => m.key === "totals");

      const homeOutcome = spreadsMarket?.outcomes?.find(
        (o: any) => o.name === e.home_team
      );
      const awayOutcome = spreadsMarket?.outcomes?.find(
        (o: any) => o.name === e.away_team
      );

      return {
        externalId: e.id,
        homeTeam: e.home_team,
        awayTeam: e.away_team,
        commenceTime: e.commence_time,
        homeSpread: homeOutcome?.point ?? null,
        awaySpread: awayOutcome?.point ?? null,
        total: totalsMarket?.outcomes?.[0]?.point ?? null,
      };
    });
}

/** Pulls final/live scores for games from the last few days, to grade picks. */
export async function fetchScores(daysFrom = 3): Promise<GameResult[]> {
  requireKey();
  const url = `${BASE}/sports/${SPORT}/scores/?apiKey=${API_KEY}&daysFrom=${daysFrom}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Odds API error ${res.status}: ${await res.text()}`);
  }
  const events = (await res.json()) as any[];

  return events.map((e) => {
    const home = e.scores?.find((s: any) => s.name === e.home_team);
    const away = e.scores?.find((s: any) => s.name === e.away_team);
    return {
      externalId: e.id,
      completed: !!e.completed,
      homeScore: home ? Number(home.score) : null,
      awayScore: away ? Number(away.score) : null,
    };
  });
}
