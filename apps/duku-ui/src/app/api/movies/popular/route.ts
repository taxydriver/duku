// apps/duku-ui/src/app/api/movies/popular/route.ts
import { NextRequest, NextResponse } from "next/server";

// Always dynamic (avoid prerender surprises)
export const dynamic = "force-dynamic";
export const revalidate = 0;

// --- simple in-memory cache & in-flight de-dupe (per server instance) ---
const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
const inflight = new Map<string, Promise<NextResponse>>();

function getCached(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as NextResponse;
}
function setCached(key: string, value: NextResponse, ttlMs: number) {
  cache.set(key, { at: Date.now(), ttl: ttlMs, value });
}

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

async function fetchPosterForImdbId(imdbId: string) {
  if (!TMDB_API_KEY) return { item_id: imdbId, title: null, poster: null };

  try {
    const resp = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { cache: "no-store" }
    );
    if (!resp.ok) return { item_id: imdbId, title: null, poster: null };
    const json = await resp.json();
    const movie = json.movie_results?.[0];
    return {
      item_id: imdbId,
      title: movie?.title ?? null,
      poster: movie?.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : null,
    };
  } catch {
    return { item_id: imdbId, title: null, poster: null };
  }
}

const FALLBACK_IMDB = [
  "tt1375666", // Inception
  "tt0133093", // The Matrix
  "tt0111161", // Shawshank
  "tt0120737", // LOTR:FOTR
  "tt0468569", // The Dark Knight
  "tt0816692", // Interstellar
  "tt0103064", // T2
  "tt0088763", // Back to the Future
  "tt4154796", // Endgame
  "tt2395427", // AoU
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kParam = url.searchParams.get("k");
  const k = (() => {
    const n = Number(kParam ?? "20");
    return Number.isFinite(n) && n > 0 ? n : 20;
  })();

  const key = `popular?k=${k}`;
  const hit = getCached(key);
  if (hit) return hit as NextResponse;

  // in-flight de-dupe
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    try {
      const r = await fetch(`${MERLIN_BASE}/api/v1/movies/popular?k=${k}`, { cache: "no-store" });

      if (!r.ok) {
        const body = await r.text();
        // On 429 or backend failure, respond with fallback posters and cache briefly
        if (r.status === 429) {
          const posters = await Promise.all(FALLBACK_IMDB.slice(0, k).map((id) => fetchPosterForImdbId(id)));
          const res = NextResponse.json(
            { items: posters },
            {
              status: 200,
              headers: {
                "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
                "X-Backend-Status": String(r.status),
                "X-Backend-Error": body.slice(0, 200),
                "X-Mode": "fallback",
              },
            }
          );
          setCached(key, res, 15_000);
          return res;
        }
        return NextResponse.json({ error: body }, { status: r.status });
      }

      const raw = await r.json();
      const items: Array<{ item_id: string }> = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.items)
        ? raw.items
        : [];

      const withPosters = await Promise.all(items.map((d) => fetchPosterForImdbId(d.item_id)));
      const res = NextResponse.json(
        { items: withPosters },
        { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } }
      );
      setCached(key, res, 15_000);
      return res;
    } catch (err: any) {
      const posters = await Promise.all(FALLBACK_IMDB.slice(0, k).map((id) => fetchPosterForImdbId(id)));
      const res = NextResponse.json(
        { items: posters },
        {
          headers: {
            "Cache-Control": "public, max-age=10, stale-while-revalidate=60",
            "X-Backend-Error": String(err?.message ?? err).slice(0, 200),
            "X-Mode": "fallback",
          },
        }
      );
      setCached(key, res, 10_000);
      return res;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}
// apps/duku-ui/src/app/api/user/ratings/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const cache = new Map<string, { at: number; ttl: number; value: NextResponse }>();
const inflight = new Map<string, Promise<NextResponse>>();

function getCached(key: string) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}
function setCached(key: string, value: NextResponse, ttlMs: number) {
  cache.set(key, { at: Date.now(), ttl: ttlMs, value });
}

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  // Identify the user/session via cookies set by the app
  const userId = req.cookies.get("duku_user_id")?.value;
  const sessionId = req.cookies.get("duku_session_id")?.value;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "500");

  const qs = new URLSearchParams();
  if (userId) qs.set("user_id", userId);
  if (!userId && sessionId) qs.set("session_id", sessionId);
  qs.set("limit", String(Number.isFinite(limit) && limit > 0 ? limit : 500));

  const key = `ratings?${qs.toString()}`;
  const hit = getCached(key);
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = (async () => {
    try {
      const r = await fetch(`${MERLIN_BASE}/api/v1/user/ratings?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) {
        const body = await r.text();
        if (r.status === 429) {
          const res = NextResponse.json([], {
            headers: {
              "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
              "X-Backend-Status": String(r.status),
              "X-Backend-Error": body.slice(0, 200),
              "X-Mode": "degraded",
            },
          });
          setCached(key, res, 15_000);
          return res;
        }
        return NextResponse.json({ error: body }, { status: r.status });
      }

      const raw = await r.json();
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
      const res = NextResponse.json(arr, {
        headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
      });
      setCached(key, res, 15_000);
      return res;
    } catch (err: any) {
      const res = NextResponse.json([], {
        headers: {
          "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
          "X-Backend-Error": String(err?.message ?? err).slice(0, 200),
          "X-Mode": "degraded",
        },
      });
      setCached(key, res, 10_000);
      return res;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}