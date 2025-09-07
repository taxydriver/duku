// apps/duku-ui/src/app/api/auth/state/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const jar = await cookies();
  const user_id = jar.get("duku_user_id")?.value || null;
  const session_id = jar.get("duku_uid")?.value || null;
  return NextResponse.json({ user_id, session_id });
}