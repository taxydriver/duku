import { NextResponse } from "next/server";
const MERLIN = process.env.MERLIN_API!;

export async function GET() {
  const r = await fetch(`${MERLIN}/movies/popular`, { cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: await r.text() }, { status: r.status });
  return NextResponse.json({ items: await r.json() });
}