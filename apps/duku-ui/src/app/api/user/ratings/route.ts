import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const MERLIN = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

type CacheEntry = {
  timestamp: number;
  data: Array<{ item_id: string; value: number }>; // always an array
};

const CACHE_TTL = 30 * 1000; // base 30s
const RATE_LIMIT_BACKOFF = 15 * 1000; // extend TTL on 429s to calm down bursts
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

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  }

  if (inflight.has(cacheKey)) return inflight.get(cacheKey)!;

  const fetchPromise = (async () => {
    try {
      const qs = new URLSearchParams();
      if (userId) qs.set("user_id", userId);
      if (sessionId) qs.set("session_id", sessionId);

      const r = await fetch(`${MERLIN}/api/v1/user/ratings?${qs.toString()}`, { cache: "no-store" });

      // If backend rate limits or errors, return a safe empty array and cache it briefly
      if (!r.ok) {
        const status = r.status;
        const bodyText = await r.text().catch(() => "");
        // store empty array so client UI doesn't crash (.forEach on undefined)
        const empty: Array<{ item_id: string; value: number }> = [];
        const ttl = status === 429 ? RATE_LIMIT_BACKOFF : 5_000; // back off more on 429
        cache.set(cacheKey, { timestamp: Date.now() - (CACHE_TTL - ttl), data: empty });
        inflight.delete(cacheKey);
        return NextResponse.json(empty, { status: 200, headers: { "X-Backend-Status": String(status), "X-Backend-Error": bodyText.slice(0, 120) } });
      }

      const raw = (await r.json()) as Array<{ item_id: string; event_type?: string; value?: number }>;

      const latest = new Map<string, number>();
      for (const ev of raw || []) {
        const v = typeof ev.value === "number"
          ? ev.value
          : ev.event_type === "like" ? 1
          : ev.event_type === "star" ? 5
          : ev.event_type === "unlike" ? -1
          : 0;
        latest.set(ev.item_id, v);
      }

      const normalized = [...latest.entries()].map(([item_id, value]) => ({ item_id, value }));
      cache.set(cacheKey, { timestamp: Date.now(), data: normalized });
      inflight.delete(cacheKey);

      return NextResponse.json(normalized, {
        headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
      });
    } catch (err: any) {
      // Network failure: answer with empty and short cache
      const empty: Array<{ item_id: string; value: number }> = [];
      cache.set(cacheKey, { timestamp: Date.now() - (CACHE_TTL - 5000), data: empty });
      inflight.delete(cacheKey);
      return NextResponse.json(empty, { status: 200, headers: { "X-Error": String(err?.message || err) } });
    }
  })();

  inflight.set(cacheKey, fetchPromise);
  return fetchPromise;
}