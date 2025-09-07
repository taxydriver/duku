// api/movies/search/route.ts
import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

function posterUrl(path?: string | null) {
  return path ? `https://image.tmdb.org/t/p/w500${path}` : null;
}

async function tmdb<T = any>(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`TMDB ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const kParam = url.searchParams.get("k");
  const k = (() => {
    const n = Number(kParam ?? "20");
    return Number.isFinite(n) && n > 0 ? n : 20;
  })();

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: "TMDB_API_KEY not set" }, { status: 500 });
  }
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  // 1) Search TMDB by text
  const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
    q
  )}&include_adult=false`;
  const search = await tmdb<{ results: any[] }>(searchUrl);

  // 2) Take top-k and fetch external_ids for IMDb mapping
  const top = (search.results || []).slice(0, k);

  const items = await Promise.all(
    top.map(async (m) => {
      try {
        const ext = await tmdb<{ imdb_id?: string }>(
          `https://api.themoviedb.org/3/movie/${m.id}/external_ids?api_key=${TMDB_API_KEY}`
        );
        // Only keep entries that have an imdb_id (so we align with your catalog/recs)
        if (!ext.imdb_id) return null;
        return {
          item_id: ext.imdb_id,                // IMDb id like tt1375666
          title: m.title ?? m.name ?? null,
          poster: posterUrl(m.poster_path),
          year:
            typeof m.release_date === "string" && m.release_date.length >= 4
              ? Number(m.release_date.slice(0, 4))
              : null,
        };
      } catch {
        return null;
      }
    })
  );

  // 3) Filter nulls and dedupe by item_id
  const cleaned = items.filter(Boolean) as {
    item_id: string;
    title: string | null;
    poster: string | null;
    year: number | null;
  }[];

  const dedup = Array.from(
    new Map(cleaned.map((x) => [x.item_id, x])).values()
  );

  return NextResponse.json({ items: dedup });
}