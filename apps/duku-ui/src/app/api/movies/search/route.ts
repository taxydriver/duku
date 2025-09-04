import { NextRequest, NextResponse } from "next/server";

const MERLIN = process.env.MERLIN_API ?? "http://localhost:8080";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.search; // ?q=term&limit=20
  const r = await fetch(`${MERLIN}/movies/search${qs}`, { cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
  return NextResponse.json({ items: await r.json() });
}