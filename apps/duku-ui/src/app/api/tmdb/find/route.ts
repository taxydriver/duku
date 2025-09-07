// apps/duku-ui/src/app/api/tmdb/find/route.ts
import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const imdbId = url.searchParams.get("imdb_id");
  if (!imdbId) {
    return NextResponse.json({ error: "imdb_id required" }, { status: 400 });
  }
  if (!TMDB_API_KEY) {
    return NextResponse.json({ title: null, poster: null }); // silent no-op if key missing
  }

  try {
    const resp = await fetch(
      `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
      { cache: "no-store" }
    );
    const json = await resp.json();
    const movie = json?.movie_results?.[0];
    const poster = movie?.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;
    return NextResponse.json({ title: movie?.title ?? null, poster });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "tmdb error" }, { status: 502 });
  }
}