import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type CacheEntry = {
  timestamp: number;
  data: Array<{ item_id: string; value: number }>;
};

const CACHE_TTL = 30 * 1000; // 30 seconds in milliseconds
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<NextResponse>>();

function buildCacheKey(userId: string | null, sessionId: string | null) {
  return `user:${userId ?? "null"}|session:${sessionId ?? "null"}`;
}

export async function GET(_req: NextRequest) {
  const jar = await cookies();
  const userId = jar.get("duku_user_id")?.value || null;
  const sessionId = userId ? null : jar.get("duku_uid")?.value || null;

  const cacheKey = buildCacheKey(userId, sessionId);

  // Check cache
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Check if there is an inflight request for the same key
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const qs = new URLSearchParams();
    if (userId) qs.set("user_id", userId);
    if (sessionId) qs.set("session_id", sessionId);

    const r = await fetch(`${MERLIN}/api/v1/user/ratings?${qs.toString()}`, { cache: "no-store" });
    if (!r.ok) {
      inflight.delete(cacheKey);
      return NextResponse.json(await r.text(), { status: r.status });
    }

    const raw = (await r.json()) as Array<{ item_id: string; event_type?: string; value?: number }>;

    const latest = new Map<string, number>();
    for (const ev of raw) {
      const v = typeof ev.value === "number"
        ? ev.value
        : ev.event_type === "like" ? 1
        : ev.event_type === "star" ? 5
        : ev.event_type === "unlike" ? -1
        : 0;
      latest.set(ev.item_id, v);
    }

    const normalized = [...latest.entries()].map(([item_id, value]) => ({ item_id, value }));

    cache.set(cacheKey, { timestamp: now, data: normalized });
    inflight.delete(cacheKey);

    return NextResponse.json(normalized);
  })();

  inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}