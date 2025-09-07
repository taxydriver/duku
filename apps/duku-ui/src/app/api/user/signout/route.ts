import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const jar = await cookies();
  jar.delete("duku_user_id", { path: "/" });
  return NextResponse.json({ ok: true });
}