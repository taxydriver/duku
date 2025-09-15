// apps/duku-ui/src/app/api/ratings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");

// ---- NEW: in-process single-flight map to dedupe concurrent writes
const inflight = new Map<string, Promise<Response>>();

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

// ---- NEW: small retry helper that backs off on 429/5xx
async function fetchWithBackoff(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let delay = 200; // ms
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, { ...init, cache: "no-store", keepalive: true });
    // success or client error other than 429 -> return immediately
    if (r.status !== 429 && r.status < 500) return r;
    if (i === attempts - 1) return r;
    await new Promise((res) => setTimeout(res, delay + Math.random() * 150));
    delay *= 2;
  }
  // unreachable, but types like it
  return fetch(url, init);
}

export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => ({}))) ?? {};
  console.log("[API /api/ratings] incoming body from UI:", raw);

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
    event_type,
    ...(context ? { context } : {}),
  };

  console.log("[API /api/ratings] sending to Merlin /api/v1/events", payload);

  // ---- NEW: single-flight key to prevent duplicate concurrent posts
  const key = `${sessionId}:${item_id}:${event_type}`;
  if (inflight.has(key)) {
    console.log("[API /api/ratings] deduped concurrent POST", key);
    await inflight.get(key);
    // Return a lightweight OK so the UI can optimistically move on
    return NextResponse.json({ ok: true, deduped: true });
  }

  const task = (async () => {
    try {
      const r = await fetchWithBackoff(`${MERLIN_BASE}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      console.log("[API /api/ratings] Merlin response", { status: r.status, length: text.length });

      if (!r.ok) {
        // surface 429 so the client could choose to retry later if needed
        console.error("[API /api/ratings] Merlin error body:", text.slice(0, 200));
        return NextResponse.json({ error: text || `HTTP ${r.status}` }, { status: r.status });
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
  })();

  inflight.set(key, task.finally(() => inflight.delete(key)));
  return task;
}