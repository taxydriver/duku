import { NextRequest, NextResponse } from "next/server";

const TMDB_KEY = process.env.TMDB_API_KEY!;
const IMG_BASE = "https://image.tmdb.org/t/p";
const IMG_SIZE = "w342";

type ItemIn = { title: string; year?: number; tmdbId?: number | null };
type ItemOut = { key: string; posterUrl?: string | null };

// simple in-memory cache (per server process)
const posterCache = new Map<string, string | null>();
const keyOf = (it: ItemIn) => `${it.tmdbId ?? ""}|${it.title}|${it.year ?? ""}`;

async function fetchPosterByTmdbId(id: number): Promise<string | null> {
  const url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`;
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.poster_path ? `${IMG_BASE}/${IMG_SIZE}${d.poster_path}` : null;
}

async function fetchPosterBySearch(title: string, year?: number): Promise<string | null> {
  const r = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`,
    { cache: "force-cache" }
  );
  if (!r.ok) return null;
  const d = await r.json();
  let best = (d.results ?? [])[0];
  if (best && year) {
    best = (d.results ?? []).sort((a: any, b: any) => {
      const ay = (a.release_date || "").slice(0, 4);
      const by = (b.release_date || "").slice(0, 4);
      const da = Math.abs((+ay || 0) - year);
      const db = Math.abs((+by || 0) - year);
      return da - db;
    })[0];
  }
  return best?.poster_path ? `${IMG_BASE}/${IMG_SIZE}${best.poster_path}` : null;
}

export async function POST(req: NextRequest) {
  if (!TMDB_KEY) {
    return NextResponse.json({ error: "TMDB_API_KEY missing" }, { status: 500 });
  }

  const { items } = (await req.json()) as { items: ItemIn[] };
  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ posters: [] });
  }

  // de-dupe and consult cache first
  const uniq: ItemIn[] = [];
  const keys: string[] = [];
  for (const it of items) {
    const k = keyOf(it);
    keys.push(k);
    if (!posterCache.has(k)) uniq.push(it);
  }

  // fetch posters (prefer tmdbId; fallback to search)
  await Promise.all(
    uniq.map(async (it) => {
      const k = keyOf(it);
      let url: string | null = null;
      try {
        if (it.tmdbId) url = await fetchPosterByTmdbId(it.tmdbId);
        if (!url) url = await fetchPosterBySearch(it.title, it.year);
      } catch {
        url = null;
      }
      posterCache.set(k, url);
    })
  );

  // return in same order as input
  const out: ItemOut[] = items.map((it) => ({
    key: `${it.title}${it.year ? ` (${it.year})` : ""}`,
    posterUrl: posterCache.get(keyOf(it)) ?? null,
  }));

  return NextResponse.json({ posters: out });
}