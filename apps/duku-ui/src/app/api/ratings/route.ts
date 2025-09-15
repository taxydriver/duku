import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");

// --- single-flight to dedupe concurrent toggles for same (session,item)
const inflight = new Map<string, Promise<Response>>();

// --- per-session simple token bucket (pace to ~5 req/sec)
const pace = new Map<string, { tokens: number; last: number }>();
const BUCKET_SIZE = 5;
const REFILL_MS = 1000;

async function rateLimit(sessionId: string) {
  const now = Date.now();
  const s = pace.get(sessionId) ?? { tokens: BUCKET_SIZE, last: now };
  // refill
  const delta = now - s.last;
  if (delta > 0) {
    const refill = Math.floor(delta / REFILL_MS) * BUCKET_SIZE;
    s.tokens = Math.min(BUCKET_SIZE, s.tokens + refill);
    s.last = now;
  }
  if (s.tokens <= 0) {
    // wait a little and try once more
    await new Promise((r) => setTimeout(r, 220));
    return rateLimit(sessionId);
  }
  s.tokens -= 1;
  pace.set(sessionId, s);
}

// backoff on 429/5xx, up to ~2s total
async function fetchWithBackoff(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let delay = 200;
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, { ...init, cache: "no-store", keepalive: true });
    if (r.status !== 429 && r.status < 500) return r;
    if (i === attempts - 1) return r;
    await new Promise((res) => setTimeout(res, delay + Math.random() * 150));
    delay *= 2;
  }
  return fetch(url, init);
}

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
  }
  return id;
}

export async function POST(req: NextRequest) {
  const raw = (await req.json().catch(() => ({}))) ?? {};
  const item_id =
    raw.item_id ?? raw.id ?? raw.imdb_id ?? raw.imdbId ?? raw.movieId ?? null;
  const event_type = raw.event_type ?? "like";
  const context = raw.context && typeof raw.context === "object" ? raw.context : undefined;

  if (!item_id) {
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }

  const jar = await cookies();
  const registeredUserId = jar.get("duku_user_id")?.value;
  const sessionId = await getOrCreateSessionId();

  // pace requests per session to avoid upstream 429s
  await rateLimit(sessionId);

  const payload = {
    user_id: registeredUserId ?? null,
    session_id: sessionId,
    item_id,
    event_type,
    ...(context ? { context } : {}),
  };

  const key = `${sessionId}:${item_id}:${event_type}`;
  if (inflight.has(key)) {
    await inflight.get(key);
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

      // If still 429 after our pacing and backoff, swallow and return 200 so UI stays happy.
      if (r.status === 429) {
        return NextResponse.json({ ok: false, rate_limited: true }, { status: 200 });
      }

      if (!r.ok) {
        return NextResponse.json({ error: text || `HTTP ${r.status}` }, { status: r.status });
      }

      try {
        const json = JSON.parse(text);
        return NextResponse.json(json);
      } catch {
        return NextResponse.json({ error: text }, { status: 502 });
      }
    } catch (err) {
      return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
    }
  })();

  inflight.set(key, task.finally(() => inflight.delete(key)));
  return task;
}