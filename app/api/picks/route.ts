import { NextResponse } from "next/server";
import { getUserById, getWeek, getWeekGames, getUserPickForWeek, insertPick, hasDoubleDownElsewhere, type Game } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const { userId, pin, weekId, gameId, pickType, pickedSide, isDoubleDown } = body ?? {};

  if (
    typeof userId !== "number" ||
    typeof pin !== "string" ||
    typeof weekId !== "number" ||
    typeof gameId !== "number" ||
    (pickType !== "spread" && pickType !== "total") ||
    !["home", "away", "over", "under"].includes(pickedSide) ||
    typeof isDoubleDown !== "boolean"
  ) {
    return NextResponse.json({ error: "Invalid pick payload." }, { status: 400 });
  }
  if (pickType === "spread" && !["home", "away"].includes(pickedSide)) {
    return NextResponse.json({ error: "A spread pick must be home or away." }, { status: 400 });
  }
  if (pickType === "total" && !["over", "under"].includes(pickedSide)) {
    return NextResponse.json({ error: "A total pick must be over or under." }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user || user.pin !== pin) {
    return NextResponse.json({ error: "Name/PIN didn't match." }, { status: 401 });
  }

  const week = await getWeek(weekId);
  if (!week) {
    return NextResponse.json({ error: "Week not found." }, { status: 404 });
  }
  const now = Date.now();
  if (now < new Date(week.pick_opens_at).getTime()) {
    return NextResponse.json(
      { error: "Picks for this week haven't opened yet — opens Monday 10:00pm Pacific." },
      { status: 403 }
    );
  }
  if (now >= new Date(week.pick_closes_at).getTime()) {
    return NextResponse.json(
      { error: "Picks for this week are closed — closed Sunday 10:00am Pacific." },
      { status: 403 }
    );
  }

  const existing = await getUserPickForWeek(userId, weekId);
  if (existing) {
    return NextResponse.json(
      { error: "You've already locked in your pick for this week — it can't be changed." },
      { status: 403 }
    );
  }

  const games = await getWeekGames(weekId);
  const game = games.find((g) => g.id === gameId) as Game | undefined;
  if (!game) {
    return NextResponse.json({ error: "Game not found in this week's slate." }, { status: 404 });
  }
  if (new Date(game.commence_time).getTime() <= Date.now()) {
    return NextResponse.json({ error: "That game has already kicked off." }, { status: 403 });
  }

  if (isDoubleDown && (await hasDoubleDownElsewhere(userId, weekId))) {
    return NextResponse.json(
      { error: "You've already used your double down this season." },
      { status: 403 }
    );
  }

  let lockedLine: number | null = null;
  if (pickType === "spread") {
    lockedLine = pickedSide === "home" ? game.home_spread : game.away_spread;
  } else {
    lockedLine = game.total;
  }
  if (lockedLine === null) {
    return NextResponse.json({ error: "DraftKings hasn't posted that line yet." }, { status: 400 });
  }

  const inserted = await insertPick({ userId, weekId, gameId, pickType, pickedSide, lockedLine, isDoubleDown });
  if (!inserted) {
    return NextResponse.json(
      { error: "You've already locked in your pick for this week — it can't be changed." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
