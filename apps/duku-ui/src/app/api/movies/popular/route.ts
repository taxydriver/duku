// apps/duku-ui/src/app/api/movies/popular/route.ts
import { NextRequest, NextResponse } from "next/server";

// Ensure this route is always dynamic (avoid prerender/export surprises)
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const kParam = url.searchParams.get("k");
  const k = (() => {
    const n = Number(kParam ?? "20");
    return Number.isFinite(n) && n > 0 ? n : 20;
  })();

  const r = await fetch(`${MERLIN_BASE}/api/v1/movies/popular?k=${k}`, { cache: "no-store" });
  if (!r.ok) {
    // Surface backend error to caller
    return NextResponse.json({ error: await r.text() }, { status: r.status });
  }

  const raw = await r.json();

  // Normalize (input): accept either array or {items: [...]}
  const items: Array<{ item_id: string }> = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : [];

  const withPosters = await Promise.all(items.map((d) => fetchPosterForImdbId(d.item_id)));

  // Return an object with `items` for backward compatibility with the UI
  return NextResponse.json({ items: withPosters });
}