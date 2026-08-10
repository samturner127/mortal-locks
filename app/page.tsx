"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, clearSession, type Session } from "@/lib/session";

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
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest2 text-amber uppercase">Mortal Locks</p>
          <h1 className="font-display text-2xl font-semibold">Hey {session.name.split(" ")[0]}</h1>
        </div>
        <div className="flex gap-4 text-sm">
          <a href="/leaderboard" className="text-mute hover:text-ink transition">
            Leaderboard
          </a>
          <button
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
            className="text-mute hover:text-ink transition"
          >
            Switch
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
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[11px] tracking-widest2 text-mute uppercase">
            This week&apos;s slate — pick one
          </p>
          {week && (
            <p className="font-mono text-[11px] text-mute">
              {windowOpen
                ? `Picks close ${new Date(week.pick_closes_at).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : now < (opensAt ?? 0)
                ? `Picks open ${new Date(week.pick_opens_at).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "Picks are closed for this week"}
            </p>
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
                  "w-full text-left px-4 py-3 rounded-lg border transition " +
                  (active
                    ? "border-amber bg-amber/10"
                    : "border-panelLine hover:border-mute") +
                  (locked ? " opacity-40 cursor-not-allowed" : "")
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm">
                    {g.away_team} @ {g.home_team}
                  </span>
                  <span className="font-mono text-xs text-mute">
                    {locked
                      ? "Locked"
                      : new Date(g.commence_time).toLocaleString(undefined, {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                  </span>
                </div>
                <div className="font-mono text-xs text-mute mt-1">{formatGameLine(g)}</div>
              </button>
            );
          })}
        </div>

        {myPick ? (
          <div className="text-center py-4">
            {justLocked && <LockAnimation />}
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
                : "No changes once submitted."}
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

            {/* Double down toggle */}
            <label className="flex items-center gap-3 mt-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isDoubleDown}
                disabled={ddUsedElsewhere}
                onChange={(e) => setIsDoubleDown(e.target.checked)}
                className="w-4 h-4 accent-loss"
              />
              <span className="text-sm">
                Double down on this pick
                <span className="text-mute ml-1">(doubles it — win, lose, or push, all count double)</span>
              </span>
            </label>
            {ddUsedElsewhere && (
              <p className="font-mono text-xs text-mute mt-1">
                Already spent your season&apos;s double down.
              </p>
            )}

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
                {checkingLine ? "Checking odds…" : status === "saving" ? "Saving…" : "Lock it in"}
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
                {describePick(p)}
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

/** Plays once on mount — a padlock snapping shut with a burst of flames. */
function LockAnimation() {
  return (
    <div className="lock-anim-stage" aria-hidden="true">
      <div className="lock-anim-flames">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="lock-anim-flame" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <svg className="lock-anim-svg" viewBox="0 0 64 64" width="56" height="56">
        <rect x="16" y="28" width="32" height="26" rx="6" fill="#E8432C" />
        <circle cx="32" cy="40" r="4" fill="#0A0505" />
        <rect x="30" y="42" width="4" height="8" rx="2" fill="#0A0505" />
        <path
          className="lock-anim-shackle"
          d="M22 28 V20 a10 10 0 0 1 20 0 V28"
          fill="none"
          stroke="#E8432C"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    </div>
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

function formatGameLine(g: {
  home_team: string;
  away_team: string;
  home_spread: number | null;
  away_spread: number | null;
  total: number | null;
}) {
  let spreadText = "—";
  if (g.home_spread !== null && g.away_spread !== null) {
    const favorite = g.home_spread <= g.away_spread ? { team: g.home_team, spread: g.home_spread } : { team: g.away_team, spread: g.away_spread };
    spreadText = `${favorite.team} ${formatSpread(favorite.spread)}`;
  }
  const totalText = g.total !== null ? `O/U ${g.total}` : "—";
  return `${spreadText} · ${totalText}`;
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
