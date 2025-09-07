// api/user/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export async function POST(req: NextRequest) {
  const payload = await req.json();

  const resp = await fetch(`${MERLIN}/api/v1/users/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    return NextResponse.json({ error: text }, { status: resp.status });
  }

  const data = JSON.parse(text);
  if (data.user_id) {
    const jar = await cookies();
    jar.set("duku_user_id", data.user_id, {
      httpOnly: false, // client code may read it
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  return NextResponse.json(data);
}