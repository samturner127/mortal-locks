"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, type Session } from "@/lib/session";
import { describePickAbbrev } from "@/lib/pickFormat";
import { abbreviateTeam } from "@/lib/teamAbbreviations";

type Week = {
  id: number;
  season: number;
  week_number: number;
  pick_opens_at: string;
  pick_closes_at: string;
};

type Game = {
  id: number;
  home_team: string;
  away_team: string;
  commence_time: string;
  home_spread: number | null;
  away_spread: number | null;
  total: number | null;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
};

type PickType = "spread" | "total";
type PickedSide = "home" | "away" | "over" | "under";

type PoolPick = {
  user_id: number;
  name: string;
  game_id: number;
  home_team: string;
  away_team: string;
  commence_time: string;
  pick_type: PickType;
  picked_side: PickedSide;
  locked_line: number;
  is_double_down: boolean;
  is_auto_pick: boolean;
  result: "win" | "loss" | "push" | null;
};

export default function HomePage() {
  const router = useRouter();
  // session is read from localStorage, which doesn't exist during SSR — so
  // it starts as a plain literal (null) that renders identically on the
  // server and on React's first client pass, then gets populated client-only
  // in an effect after mount. Reading it synchronously in useState's
  // initializer (the old approach) causes a hydration mismatch whenever
  // you're already logged in, since the server always sees no session but
  // the client's first render would see the real one.
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [weekId, setWeekId] = useState<number | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [poolPicks, setPoolPicks] = useState<PoolPick[]>([]);
  const [ddUsedElsewhere, setDdUsedElsewhere] = useState(false);

  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [pickType, setPickType] = useState<PickType>("spread");
  const [pickedSide, setPickedSide] = useState<PickedSide>("home");
  const [isDoubleDown, setIsDoubleDown] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Only true right after a successful submit in this session — gates the
  // lock/flame animation so it doesn't replay every time someone with an
  // already-existing pick just reloads the page.
  const [justLocked, setJustLocked] = useState(false);
  const [checkingLine, setCheckingLine] = useState(false);
  const [lineChangeModal, setLineChangeModal] = useState<{ oldLine: number; newLine: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    setSession(getSession());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!session) {
      router.push("/login");
      return;
    }
    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => {
        setWeekId(d.weekId);
        setWeek(d.week);
        setGames(d.games);
        setPoolPicks(d.picks);

        const mine = d.picks.find((p: PoolPick) => p.user_id === session.userId);
        if (mine) {
          setSelectedGameId(mine.game_id);
          setPickType(mine.pick_type);
          setPickedSide(mine.picked_side);
          setIsDoubleDown(mine.is_double_down);
        } else if (d.games[0]) {
          setSelectedGameId(d.games[0].id);
        }

        if (d.weekId) {
          fetch(`/api/double-down?userId=${session.userId}&weekId=${d.weekId}`)
            .then((r) => r.json())
            .then((dd) => setDdUsedElsewhere(dd.usedElsewhere));
        }
      });
  }, [mounted, session, router]);

  if (!session) return null;
  if (!weekId || games.length === 0) {
    return <p className="text-mute font-mono text-sm">Loading this week&apos;s slate…</p>;
  }

  const selectedGame = games.find((g) => g.id === selectedGameId) ?? games[0];
  const now = Date.now();
  const opensAt = week ? new Date(week.pick_opens_at).getTime() : null;
  const closesAt = week ? new Date(week.pick_closes_at).getTime() : null;
  const windowOpen = opensAt !== null && closesAt !== null && now >= opensAt && now < closesAt;
  const gameLocked = new Date(selectedGame.commence_time).getTime() <= Date.now();
  const myPick = poolPicks.find((p) => p.user_id === session.userId);

  // lineOverride, when given, is the freshly-confirmed line from an accepted
  // line-change prompt — used for the optimistic local update below instead
  // of selectedGame's (now stale) value. The actual submitted pick always
  // gets its real line resolved fresh from the DB server-side regardless.
  async function submit(lineOverride?: number) {
    setStatus("saving");
    setErrorMsg(null);
    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: session!.userId,
        pin: session!.pin,
        weekId,
        gameId: selectedGame.id,
        pickType,
        pickedSide,
        isDoubleDown,
      }),
    });
    if (res.ok) {
      setStatus("saved");
      setJustLocked(true);
      const fallbackLine =
        pickType === "spread" ? (pickedSide === "home" ? selectedGame.home_spread : selectedGame.away_spread) : selectedGame.total;
      // Optimistically reflect the new pick locally so the locked-in view
      // shows immediately, without waiting on a refetch.
      setPoolPicks((prev) => [
        ...prev.filter((p) => p.user_id !== session!.userId),
        {
          user_id: session!.userId,
          name: session!.name,
          game_id: selectedGame.id,
          home_team: selectedGame.home_team,
          away_team: selectedGame.away_team,
          commence_time: selectedGame.commence_time,
          pick_type: pickType,
          picked_side: pickedSide,
          locked_line: lineOverride ?? fallbackLine!,
          is_double_down: isDoubleDown,
          is_auto_pick: false,
          result: null,
        },
      ]);
    } else {
      const d = await res.json();
      setErrorMsg(d.error ?? "Something went wrong.");
      setStatus("error");
    }
  }

  function currentExpectedLine(): number | null {
    const v = pickType === "spread" ? (pickedSide === "home" ? selectedGame.home_spread : selectedGame.away_spread) : selectedGame.total;
    return v === null ? null : Number(v);
  }

  // Runs a live freshness check right at lock-in time, since the daily sync
  // could be hours stale if a line moved (e.g. a late injury announcement).
  // Fails open — if the check itself errors out, submit anyway rather than
  // block picking over a flaky odds-API call.
  async function handleLockClick() {
    const expectedLine = currentExpectedLine();
    if (expectedLine === null) {
      await submit();
      return;
    }
    setCheckingLine(true);
    try {
      const res = await fetch("/api/picks/check-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: selectedGame.id, pickType, pickedSide, expectedLine }),
      });
      const d = await res.json();
      if (res.ok && d.changed) {
        setLineChangeModal({ oldLine: expectedLine, newLine: d.currentLine });
      } else {
        await submit();
      }
    } catch {
      await submit();
    } finally {
      setCheckingLine(false);
    }
  }

  function acceptLineChange() {
    if (!lineChangeModal) return;
    const newLine = lineChangeModal.newLine;
    setLineChangeModal(null);
    submit(newLine);
  }

  return (
    <div>
      <header className="flex items-center justify-between gap-3 mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest2 text-amber uppercase">Mortal Locks</p>
          <h1 className="font-display text-2xl font-semibold">Hey {session.name.split(" ")[0]}</h1>
        </div>
        <div className="flex gap-3 text-xs shrink-0 sm:gap-4 sm:text-sm">
          <a href="/leaderboard" className="text-mute hover:text-ink transition whitespace-nowrap">
            Leaderboard
          </a>
          <a href="/history" className="text-mute hover:text-ink transition whitespace-nowrap">
            Lock Log
          </a>
          <button
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
            className="text-mute hover:text-ink transition whitespace-nowrap"
          >
            Logout
          </button>
        </div>
      </header>

      {/* My pick status */}
      {myPick && (
        <div className="bg-panel border border-panelLine rounded-2xl shadow-board p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-widest2 text-mute uppercase mb-1">Your lock</p>
            <p className="font-display text-lg">
              {describePick(myPick)}
              {myPick.is_double_down && (
                <span className="ml-2 text-loss text-sm align-middle">2x</span>
              )}
              {myPick.is_auto_pick && (
                <span className="ml-2 text-mute text-xs align-middle">(auto)</span>
              )}
            </p>
          </div>
          {myPick.result && (
            <span
              className={
                "font-mono text-sm uppercase tracking-widest2 " +
                (myPick.result === "win" ? "text-teal" : myPick.result === "loss" ? "text-loss" : "text-mute")
              }
            >
              {myPick.result}
            </span>
          )}
        </div>
      )}

      {/* Game slate */}
      <div className="bg-panel border border-panelLine rounded-2xl shadow-board p-6 mb-6">
        <div className="flex flex-col gap-1 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] tracking-widest2 text-mute uppercase">
            This week&apos;s slate — pick one
          </p>
          {opensAt !== null && closesAt !== null && (
            <DeadlineClock opensAt={opensAt} closesAt={closesAt} />
          )}
        </div>
        <div className="space-y-2 mb-6">
          {games.map((g) => {
            const locked = new Date(g.commence_time).getTime() <= Date.now();
            const active = g.id === selectedGameId;
            return (
              <button
                key={g.id}
                onClick={() => !locked && setSelectedGameId(g.id)}
                disabled={locked}
                className={
                  "w-full text-left px-3 sm:px-4 py-3 rounded-lg border transition " +
                  (active
                    ? "border-amber bg-amber/10"
                    : "border-panelLine hover:border-mute") +
                  (locked ? " opacity-40 cursor-not-allowed" : "")
                }
              >
                {/* Matchup always breaks after the "@" — full team names don't
                    fit on one phone-width line, and letting them wrap on their
                    own broke in a different place on every row. The kickoff
                    time sits on the first line; "Washington Commanders @" is
                    the league's longest and is what the widths are tuned to. */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-sm">
                    {g.away_team} <span className="text-mute">@</span>
                  </span>
                  <span className="font-mono text-[11px] text-mute tabular-nums whitespace-nowrap">
                    {locked
                      ? "Locked"
                      : new Date(g.commence_time).toLocaleString(undefined, {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                  </span>
                </div>
                <span className="font-display text-sm block">{g.home_team}</span>
                <div className="flex items-baseline justify-between gap-3 mt-1 font-mono text-xs tabular-nums">
                  <span className="text-ink">{formatFavorite(g)}</span>
                  <span className="text-mute">{formatTotal(g)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {myPick ? (
          <div className="text-center py-4">
            {justLocked && <LockAnimation count={myPick.is_double_down ? 2 : 1} />}
            <p className="font-mono text-[11px] tracking-widest2 text-mute uppercase mb-2">
              Locked in for this week
            </p>
            <p className="font-display text-xl">
              {describePick(myPick)}
              {myPick.is_double_down && <span className="ml-2 text-loss text-base align-middle">2x</span>}
              {myPick.is_auto_pick && <span className="ml-2 text-mute text-sm align-middle">(auto)</span>}
            </p>
            <p className="text-mute text-xs mt-3">
              {myPick.is_auto_pick
                ? "You missed the cutoff — this was auto-assigned."
                : pickCommentary(myPick, myPick.game_id === games[0].id)}
            </p>
          </div>
        ) : windowOpen && !gameLocked ? (
          <>
            {/* Spread vs total */}
            <div className="flex gap-2 mb-4">
              <TypeTab label="Spread" active={pickType === "spread"} onClick={() => setPickType("spread")} />
              <TypeTab label="Over / Under" active={pickType === "total"} onClick={() => setPickType("total")} />
            </div>

            {pickType === "spread" ? (
              <div className="grid grid-cols-2 gap-3">
                <SideButton
                  label={selectedGame.away_team}
                  sub={formatSpread(selectedGame.away_spread)}
                  active={pickedSide === "away"}
                  onClick={() => setPickedSide("away")}
                />
                <SideButton
                  label={selectedGame.home_team}
                  sub={formatSpread(selectedGame.home_spread)}
                  active={pickedSide === "home"}
                  onClick={() => setPickedSide("home")}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <SideButton
                  label="Over"
                  sub={selectedGame.total !== null ? String(selectedGame.total) : "—"}
                  active={pickedSide === "over"}
                  onClick={() => setPickedSide("over")}
                />
                <SideButton
                  label="Under"
                  sub={selectedGame.total !== null ? String(selectedGame.total) : "—"}
                  active={pickedSide === "under"}
                  onClick={() => setPickedSide("under")}
                />
              </div>
            )}

            <DoubleDownCard
              spent={ddUsedElsewhere}
              armed={isDoubleDown}
              onChange={setIsDoubleDown}
            />

            {lineChangeModal ? (
              <div className="mt-6 rounded-lg border border-amber bg-amber/10 p-4">
                <p className="font-mono text-[11px] tracking-widest2 text-amber uppercase mb-1">
                  Odds changed
                </p>
                <p className="text-sm mb-3">
                  The line moved since we last synced —{" "}
                  <span className="font-mono">
                    {pickType === "spread" ? formatSpread(lineChangeModal.oldLine) : lineChangeModal.oldLine} →{" "}
                    {pickType === "spread" ? formatSpread(lineChangeModal.newLine) : lineChangeModal.newLine}
                  </span>
                  . Lock it in at the new line?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={acceptLineChange}
                    disabled={status === "saving"}
                    className="flex-1 bg-amber text-field font-semibold rounded-md py-2 hover:opacity-90 transition disabled:opacity-50"
                  >
                    Accept new line
                  </button>
                  <button
                    onClick={() => setLineChangeModal(null)}
                    className="flex-1 border border-panelLine rounded-md py-2 text-mute hover:text-ink transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLockClick}
                disabled={status === "saving" || checkingLine}
                className="mt-6 w-full bg-amber text-field font-semibold rounded-md py-2 hover:opacity-90 transition disabled:opacity-50"
              >
                {checkingLine
                  ? "Checking odds…"
                  : status === "saving"
                  ? "Saving…"
                  : isDoubleDown
                  ? "Lock it in — 2x"
                  : "Lock it in"}
              </button>
            )}
            {status === "error" && <p className="text-loss text-sm text-center mt-2">{errorMsg}</p>}
          </>
        ) : !windowOpen && closesAt !== null && now >= closesAt ? (
          <p className="text-mute text-sm">Picks are closed for this week.</p>
        ) : !windowOpen ? (
          <p className="text-mute text-sm">
            Picks open{" "}
            {week &&
              new Date(week.pick_opens_at).toLocaleString(undefined, {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
            .
          </p>
        ) : (
          <p className="text-mute text-sm">That game has kicked off — pick another from the slate above.</p>
        )}
      </div>

      {/* Pool status */}
      <div className="bg-panel border border-panelLine rounded-2xl shadow-board p-6">
        <p className="font-mono text-[11px] tracking-widest2 text-mute uppercase mb-4">The pool</p>
        <ul className="space-y-2">
          {poolPicks.map((p) => (
            <li
              key={p.user_id}
              className="flex items-center justify-between border-b border-panelLine last:border-0 pb-2"
            >
              <span className={p.user_id === session.userId ? "text-amber" : "text-ink"}>{p.name}</span>
              <span className="font-mono text-sm text-mute">
                {describePickAbbrev(p)}
                {p.is_double_down && <span className="text-loss ml-1">2x</span>}
                {p.is_auto_pick && <span className="text-mute ml-1 text-xs">(auto)</span>}
                {p.result && (
                  <span
                    className={
                      "ml-3 " +
                      (p.result === "win" ? "text-teal" : p.result === "loss" ? "text-loss" : "text-mute")
                    }
                  >
                    {p.result}
                  </span>
                )}
              </span>
            </li>
          ))}
          {poolPicks.length === 0 && <p className="text-mute text-sm">Nobody&apos;s picked yet — be the first.</p>}
        </ul>
      </div>
    </div>
  );
}

/**
 * Plays once on mount — a padlock snapping shut with a burst of flames, one
 * per unit the pick is worth. A double down gets two side by side, since
 * that's literally what it does to the result.
 */
function LockAnimation({ count = 1 }: { count?: number }) {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <LockGlyph key={i} />
      ))}
    </div>
  );
}

function LockGlyph() {
  return (
    <div className="lock-anim-stage" aria-hidden="true">
      <div className="lock-anim-flames">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="lock-anim-flame" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <svg className="lock-anim-svg" viewBox="0 0 64 64" width="56" height="56">
        <rect x="16" y="28" width="32" height="26" rx="6" fill="#FF7A18" />
        <circle cx="32" cy="40" r="4" fill="#08090C" />
        <rect x="30" y="42" width="4" height="8" rx="2" fill="#08090C" />
        <path
          className="lock-anim-shackle"
          d="M22 28 V20 a10 10 0 0 1 20 0 V28"
          fill="none"
          stroke="#FF7A18"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Live countdown to whichever deadline is next — the Monday open while the
 * window is still shut, the Sunday cutoff once it's running. Goes red and
 * pulses inside the last 24 hours, which is the whole point: the deadline
 * should feel like it's coming, not sit there as a static timestamp.
 */
function DeadlineClock({ opensAt, closesAt }: { opensAt: number; closesAt: number }) {
  // Stays null through the server render and React's first client pass — a
  // clock has no meaningful SSR value, and seeding it from Date.now() in the
  // useState initializer would hydrate-mismatch on every load.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;

  if (now >= closesAt) {
    return (
      <p className="font-mono text-[10px] tracking-widest2 text-mute uppercase">Picks closed</p>
    );
  }

  const open = now >= opensAt;
  const remaining = (open ? closesAt : opensAt) - now;
  const urgent = open && remaining < 24 * 60 * 60 * 1000;

  return (
    <div className="text-left sm:text-right">
      <p className="font-mono text-[10px] tracking-widest2 text-mute uppercase whitespace-nowrap">
        {open ? "Picks close in" : "Picks open in"}
      </p>
      <p
        className={
          "font-mono text-sm tabular-nums whitespace-nowrap " +
          (urgent ? "text-loss countdown-urgent" : "text-ink")
        }
      >
        {formatCountdown(remaining)}
      </p>
    </div>
  );
}

/** Always ticks down to the second — "2d 14h 22m 07s" through "22m 07s". */
function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}

/**
 * One big toggle, no confirmation step. Unarmed it's an outlined red prompt;
 * armed it's a filled red slab you click again to back out of. Once it's
 * spent there's no control at all, just a greyed-out marker.
 */
function DoubleDownCard({
  spent,
  armed,
  onChange,
}: {
  spent: boolean;
  armed: boolean;
  onChange: (value: boolean) => void;
}) {
  if (spent) {
    return (
      <div className="mt-6 rounded-lg border border-panelLine px-4 py-4 text-center">
        <p className="font-mono text-sm tracking-widest2 text-mute uppercase">
          Double down spent
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => onChange(!armed)}
      aria-pressed={armed}
      className={
        "mt-6 w-full rounded-lg border px-4 py-4 font-mono text-sm tracking-widest2 uppercase transition " +
        (armed
          ? "border-loss bg-loss text-onLoss hover:opacity-90"
          : "border-loss text-loss hover:bg-loss/10")
      }
    >
      {armed ? "Pussy out" : "Double down?"}
    </button>
  );
}

function TypeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 py-2 rounded-md font-mono text-xs tracking-widest2 uppercase transition border " +
        (active ? "border-amber text-amber bg-amber/10" : "border-panelLine text-mute hover:text-ink")
      }
    >
      {label}
    </button>
  );
}

function SideButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-lg border px-4 py-4 text-center transition " +
        (active ? "border-amber bg-amber/10" : "border-panelLine hover:border-mute")
      }
    >
      <p className="font-display text-base">{label}</p>
      <p className="font-mono text-xs text-mute mt-1">{sub}</p>
    </button>
  );
}

function formatSpread(v: number | null) {
  if (v === null) return "—";
  return v > 0 ? `+${v}` : String(v);
}

/**
 * The favorite's side of the spread, abbreviated — rendered in its own
 * left-aligned column so a full slate reads as a stack of numbers rather
 * than a stack of sentences.
 */
function formatFavorite(g: {
  home_team: string;
  away_team: string;
  home_spread: number | null;
  away_spread: number | null;
}) {
  if (g.home_spread === null || g.away_spread === null) return "—";
  const favorite =
    g.home_spread <= g.away_spread
      ? { team: g.home_team, spread: g.home_spread }
      : { team: g.away_team, spread: g.away_spread };
  return `${abbreviateTeam(favorite.team)} ${formatSpread(favorite.spread)}`;
}

function formatTotal(g: { total: number | null }) {
  return g.total !== null ? `O/U ${g.total}` : "—";
}

const PATRIOTS = "New England Patriots";
const LIONS = "Detroit Lions";
const BRONCOS = "Denver Broncos";
const BEARS = "Chicago Bears";

/**
 * Swaps the usual "No changes once submitted." footnote for a bit of
 * commentary on certain picks. Strictly ordered — the first match wins, so a
 * Patriots-Lions game gets a Patriots line, and the under on the week's
 * opener gets the under line rather than the opener one.
 *
 * `backed`/`faded` are null on a total, which is what keeps the team rules
 * from firing on an over/under: you can't be for or against a team on a
 * number. Only ever runs on a pick someone actually made — auto-picks keep
 * the message explaining they missed the cutoff.
 */
function pickCommentary(
  p: {
    home_team: string;
    away_team: string;
    pick_type: PickType;
    picked_side: PickedSide;
  },
  isFirstGame: boolean
): string {
  const isSpread = p.pick_type === "spread";
  const backed = isSpread ? (p.picked_side === "home" ? p.home_team : p.away_team) : null;
  const faded = isSpread ? (p.picked_side === "home" ? p.away_team : p.home_team) : null;

  if (backed === PATRIOTS) return "Now here's a guy that knows ball!";
  if (faded === PATRIOTS) return "What are you some kind of idiot?";
  if (backed === LIONS || faded === LIONS) return "Did you check what lunar phase the moon is in?";
  if (p.pick_type === "total" && p.picked_side === "under") return "Life is too long anyways.";
  if (backed === BRONCOS) return "Don't forget to wake up Bart for this.";
  if (isFirstGame) return "Fortune favors the bold.";
  if (backed === BEARS) return "Mmmmmm zesty!";

  return "No changes once submitted.";
}

function describePick(p: {
  home_team: string;
  away_team: string;
  pick_type: PickType;
  picked_side: PickedSide;
  locked_line: number;
}) {
  if (p.pick_type === "spread") {
    const team = p.picked_side === "home" ? p.home_team : p.away_team;
    return `${team} ${formatSpread(p.locked_line)}`;
  }
  return `${p.picked_side === "over" ? "Over" : "Under"} ${p.locked_line}`;
}
