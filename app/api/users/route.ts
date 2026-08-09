import { NextResponse } from "next/server";
import { getUsers } from "@/lib/db";

export async function GET() {
  const users = await getUsers();
  // Never send PINs to the client — just id/name for the picker.
  return NextResponse.json({ users: users.map((u) => ({ id: u.id, name: u.name })) });
}
