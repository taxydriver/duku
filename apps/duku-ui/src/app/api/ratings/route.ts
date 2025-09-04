import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.MERLIN_API ?? "http://localhost:8080";

function getOrCreateUserId() {
  const jar = cookies();
  let id = jar.get("duku_uid")?.value;
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    // httpOnly false so client pages can read it if needed (fine for a guest id)
    jar.set("duku_uid", id, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }
  return id;
}

export async function POST(req: NextRequest) {
  const body = await req.json(); // { movieId, value }
  const userId = getOrCreateUserId();

  const r = await fetch(`${MERLIN}/ratings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, userId }), // inject userId here
  });

  const text = await r.text();
  if (!r.ok) return NextResponse.json({ error: text }, { status: r.status });
  return NextResponse.json(JSON.parse(text));
}