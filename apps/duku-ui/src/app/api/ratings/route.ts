// apps/duku-ui/src/app/api/ratings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Ensure this route is always dynamic and never statically optimized
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");

async function getOrCreateSessionId() {
  const jar = await cookies();
  let id = jar.get("duku_uid")?.value;
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    jar.set("duku_uid", id, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
    console.log("[API /api/ratings] assigned new guest session_id:", id);
  } else {
    console.log("[API /api/ratings] found existing session_id:", id);
  }
  return id;
}

export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => ({}))) ?? {};
  console.log("[API /api/ratings] incoming body from UI:", raw);

  // Normalize incoming identifiers from UI components
  const item_id =
    raw.item_id ?? raw.id ?? raw.imdb_id ?? raw.imdbId ?? raw.movieId ?? null;

  const event_type = raw.event_type ?? "like";
  const context = raw.context && typeof raw.context === "object" ? raw.context : undefined;

  if (!item_id) {
    console.error("[API /api/ratings] missing item_id");
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }

  const jar = await cookies();
  const registeredUserId = jar.get("duku_user_id")?.value;
  const sessionId = await getOrCreateSessionId();

  const payload = {
    user_id: registeredUserId ?? null,
    session_id: sessionId,
    item_id,
    event_type, // "like" | "view" | "click" | "save"
    ...(context ? { context } : {}),
  };

  console.log("[API /api/ratings] sending to Merlin /api/v1/events", payload);

  try {
    const r = await fetch(`${MERLIN_BASE}/api/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await r.text();
    console.log("[API /api/ratings] Merlin response", { status: r.status, length: text.length });

    if (!r.ok) {
      console.error("[API /api/ratings] Merlin error body:", text.slice(0, 200));
      return NextResponse.json({ error: text }, { status: r.status });
    }

    try {
      const json = JSON.parse(text);
      console.log("[API /api/ratings] returning OK", json);
      return NextResponse.json(json);
    } catch {
      console.error("[API /api/ratings] failed to parse Merlin JSON");
      return NextResponse.json({ error: text }, { status: 502 });
    }
  } catch (err: unknown) {
    console.error("[API /api/ratings] fetch to Merlin failed:", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}