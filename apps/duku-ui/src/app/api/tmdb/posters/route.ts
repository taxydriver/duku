// apps/duku-ui/src/app/api/tmdb/posters/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Accept either key (Render uses NEXT_PUBLIC_TMDB_API_KEY)
const TMDB_KEY =
  process.env.NEXT_PUBLIC_TMDB_API_KEY || process.env.TMDB_API_KEY || "";

const IMG_BASE = "https://image.tmdb.org/t/p/w342";

type InItem = {
  title?: string | null;
  year?: number | null;
  tmdbId?: number | null;
};

type OutPoster = { key: string; posterUrl: string | null };

async function findPoster(it: InItem): Promise<{ title?: string; year?: number | null; poster: string | null }> {
  if (!TMDB_KEY) return { title: it.title ?? undefined, year: it.year ?? null, poster: null };

  try {
    // If a TMDB ID is known, use it directly.
    if (it.tmdbId) {
      const r = await fetch(
        `https://api.themoviedb.org/3/movie/${it.tmdbId}?api_key=${TMDB_KEY}`,
        { cache: "no-store" }
      );
      if (r.ok) {
        const j = await r.json();
        return {
          title: j?.title ?? it.title ?? undefined,
          year: j?.release_date ? Number(String(j.release_date).slice(0, 4)) : it.year ?? null,
          poster: j?.poster_path ? `${IMG_BASE}${j.poster_path}` : null,
        };
      }
    }

    // Otherwise search by title (+ year if provided).
    const query = new URLSearchParams({ query: (it.title ?? "").trim() });
    if (typeof it.year === "number") query.set("year", String(it.year));

    const r = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&${query.toString()}`,
      { cache: "no-store" }
    );
    if (!r.ok) return { title: it.title ?? undefined, year: it.year ?? null, poster: null };

    const j = await r.json();
    const hit = Array.isArray(j?.results) ? j.results[0] : undefined;

    return {
      title: hit?.title ?? it.title ?? undefined,
      year: hit?.release_date ? Number(String(hit.release_date).slice(0, 4)) : it.year ?? null,
      poster: hit?.poster_path ? `${IMG_BASE}${hit.poster_path}` : null,
    };
  } catch {
    return { title: it.title ?? undefined, year: it.year ?? null, poster: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const items: InItem[] = Array.isArray(body?.items) ? body.items : [];

    // Fetch posters in parallel (but don’t explode if TMDB is throttling).
    const results = await Promise.all(items.map(findPoster).map(p => p.catch(() => ({ poster: null } as any))));

    // Build the same key the RatingGrid uses: "Title (Year)".
    const posters: OutPoster[] = items.map((it, i) => {
      const r = results[i];
      const keyTitle = String(it.title ?? r?.title ?? "").trim();
      const key = keyTitle + (typeof it.year === "number" ? ` (${it.year})` : "");
      return { key, posterUrl: r?.poster ?? null };
    });

    return NextResponse.json({ posters });
  } catch (err) {
    console.error("[/api/tmdb/posters] error:", err);
    // Never hard-fail the page; return empty array so UI still renders titles.
    return NextResponse.json({ posters: [] });
  }
}