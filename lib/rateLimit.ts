import { bumpRateLimit } from "./db";

/**
 * Fixed-window rate limiting for the endpoints a stranger can reach.
 *
 * The counters live in Postgres (see `rate_limits` in schema.sql); this file
 * holds the policy — who gets how many of what, and how to identify them.
 */

export type Limit = { limit: number; windowSeconds: number };

/**
 * Login attempts per client IP. The pool shares one 4-digit PIN, which is
 * 10,000 guesses — unlimited attempts means a couple of minutes with a
 * script. At 10 per 10 minutes, exhausting the keyspace from one address
 * takes about a week. Far more than anyone typing a PIN by hand will ever
 * need, and the cap is per-IP so a stranger grinding away can't lock the
 * group out of their own pool.
 *
 * This does not stop a genuinely distributed attack — that needs Vercel's
 * firewall in front, or per-user PINs instead of a shared one.
 */
export const LOGIN_ATTEMPTS: Limit = { limit: 10, windowSeconds: 10 * 60 };

/** Lock-time line checks per client IP. One click is one call; 20 per 5 minutes is slack for retries. */
export const CHECK_LINE_REQUESTS: Limit = { limit: 20, windowSeconds: 5 * 60 };

/**
 * Global ceiling on live odds fetches triggered by line checks, across every
 * caller. The free Odds API tier is 500 requests/month (~16/day), and the two
 * crons already spend up to 3 of those daily, so an unauthenticated endpoint
 * that can call the provider is a way to spend real money. Real usage is a
 * handful of lock-ins a week; 20/day leaves plenty of headroom while making
 * it impossible to drain the month's quota in an afternoon.
 */
export const ODDS_FETCH_BUDGET: Limit = { limit: 20, windowSeconds: 24 * 60 * 60 };

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function checkRateLimit(key: string, { limit, windowSeconds }: Limit): Promise<RateLimitResult> {
  const { count, windowStartedAt } = await bumpRateLimit(key, windowSeconds);
  const elapsed = (Date.now() - new Date(windowStartedAt).getTime()) / 1000;
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}

/**
 * Best-effort client address for bucketing. Vercel sets both of these on the
 * way in; `x-real-ip` is preferred because `x-forwarded-for` is a list the
 * client can prepend to. A spoofed value just means that request is counted
 * under a different bucket, so the worst case is a limit that's easier to
 * slip past — never one that blocks somebody else.
 */
export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
