import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.MERLIN_API ?? "http://localhost:8080";

function getOrCreateUserId() {
  const jar = cookies();
  let id = jar.get("duku_uid")?.value;
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    jar.set("duku_uid", id, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return id;
}

export async function GET(req: NextRequest) {
  const userId = getOrCreateUserId();
  const url = new URL(req.url);
  // pass through algo/ser/explore/novel/limit (if sent)
  const pass = new URLSearchParams(url.searchParams);
  pass.set("userId", userId);

  const r = await fetch(`${MERLIN}/recs?${pass.toString()}`, { cache: "no-store" });
  const text = await r.text();
  if (!r.ok) return NextResponse.json({ error: text }, { status: r.status });

  // Merlin returns an array; wrap to { items } for the UI
  const items = JSON.parse(text);
  return NextResponse.json({ items });
}