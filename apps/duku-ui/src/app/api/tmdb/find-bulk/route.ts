import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

async function findOne(imdbId: string) {
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { cache: "no-store" }
    );
    if (!r.ok) return { imdbId, title: null, poster: null };
    const j = await r.json();
    const m = j?.movie_results?.[0];
    return {
      imdbId,
      title: m?.title ?? null,
      year: m?.release_date ? Number((m.release_date as string).slice(0, 4)) : null,
      poster: m?.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    };
  } catch {
    return { imdbId, title: null, poster: null };
  }
}

export async function POST(req: NextRequest) {
  if (!TMDB_API_KEY) {
    // Silent no-op to avoid breaking UI if key missing
    return NextResponse.json({ items: [] });
  }
  const body = await req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(body?.imdb_ids) ? body.imdb_ids.slice(0, 100) : []; // small safety cap
  const out = await Promise.all(ids.map(findOne));
  return NextResponse.json({ items: out });
}