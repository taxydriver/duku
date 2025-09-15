// apps/duku-ui/src/app/api/movies/popular/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

// tiny in-memory cache to soften 429s
const mem = new Map<string, { at: number; data: any }>();
const TTL_OK = 10_000;   // 10s
const TTL_BAD = 5_000;   // 5s

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const k = Math.max(1, Number(url.searchParams.get("k") ?? "20") || 20);

  const cacheKey = `popular?k=${k}`;
  const hit = mem.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_OK) {
    return NextResponse.json(hit.data);
  }

  const r = await fetch(`${MERLIN_BASE}/api/v1/movies/popular?k=${k}`, { cache: "no-store" });

  // handle rate limit or errors with a soft fallback
  if (!r.ok) {
    // quick fallback list so the UI still renders something
    const seed = [
      "tt1375666","tt0133093","tt0111161","tt0120737","tt0468569",
      "tt0816692","tt0103064","tt0088763","tt2395427","tt4154796",
    ].slice(0, k);
    const withPosters = await Promise.all(seed.map((id) => fetchPosterForImdbId(id)));
    const payload = { items: withPosters, degraded: true, status: r.status };
    mem.set(cacheKey, { at: Date.now(), data: payload });
    return NextResponse.json(payload, { headers: { "X-Mode": "degraded" }, status: 200 });
  }

  const raw = await r.json();
  const items: Array<{ item_id: string }> = Array.isArray(raw) ? raw :
    Array.isArray(raw?.items) ? raw.items : [];

  const withPosters = await Promise.all(items.map((d) => fetchPosterForImdbId(d.item_id)));
  const payload = { items: withPosters };
  mem.set(cacheKey, { at: Date.now(), data: payload });
  return NextResponse.json(payload);
}