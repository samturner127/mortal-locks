/**
 * Shared bearer-token check for the /api/cron/* endpoints.
 *
 * Fails *closed*: if CRON_SECRET isn't configured, every request is refused
 * rather than waved through. The previous form was
 * `if (process.env.CRON_SECRET && auth !== ...)`, which skipped the check
 * entirely whenever the variable was missing — so a renamed or dropped env
 * var in Vercel would silently publish the sync and auto-pick endpoints to
 * anyone, with nothing in the logs to say so.
 *
 * Returns null when the request is authorized, or the response to send back.
 */
export function cronAuthError(req: Request): { status: number; error: string } | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      status: 500,
      error: "CRON_SECRET is not set on this deployment — refusing to run unauthenticated.",
    };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
