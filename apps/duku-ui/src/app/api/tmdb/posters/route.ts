import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Read either public or server TMDB key
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || process.env.TMDB_API_KEY || "";
const IMG_BASE = "https://image.tmdb.org/t/p";
const IMG_SIZE = "w342"; // keep small to avoid heavy responses

// --------------------------------------
// Input/Output types (accept multiple shapes)
// --------------------------------------

type InItemFlexible = {
  // When coming from IMDb-based flows
  item_id?: string; // IMDb id like "tt1375666"
  // When coming from title/year/tmdbId flows
  title?: string;
  year?: number;
  tmdbId?: number | null;
};

type InBody =
  | { ids: string[] }
  | { items: InItemFlexible[] };

type OutItem = {
  // Will be IMDb id if provided in input; otherwise undefined
  item_id?: string;
  title: string | null;
  poster: string | null;
  reason: string; // diagnostic string: ok | no_match | no_tmdb_key | tmdb_status_XXX | error
};

// --------------------------------------
// Small in-memory cache to reduce TMDB calls
// --------------------------------------

const cache = new Map<string, { expires: number; value: OutItem }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKeyFromInput(x: InItemFlexible): string {
  if (x.item_id) return `imdb:${x.item_id}`;
  return `title:${x.title ?? ""}|year:${x.year ?? ""}|tmdb:${x.tmdbId ?? ""}`;
}

function fromPosterPath(path?: string | null): string | null {
  return path ? `${IMG_BASE}/${IMG_SIZE}${path}` : null;
}

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  return { ok: r.ok, status: r.status, json: r.ok ? await r.json().catch(() => ({})) : null } as const;
}

async function getByImdb(imdbId: string): Promise<OutItem> {
  if (!TMDB_KEY) return { item_id: imdbId, title: null, poster: null, reason: "no_tmdb_key" };

  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`;
  let res = await fetchJson(url);
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 400));
    res = await fetchJson(url);
  }
  if (!res.ok) return { item_id: imdbId, title: null, poster: null, reason: `tmdb_status_${res.status}` };

  const movie = (res.json as any)?.movie_results?.[0];
  return {
    item_id: imdbId,
    title: movie?.title ?? null,
    poster: fromPosterPath(movie?.poster_path),
    reason: movie ? "ok" : "no_match",
  };
}

async function getByTitleYear(title: string, year?: number, tmdbId?: number | null): Promise<OutItem> {
  if (!TMDB_KEY) return { title, poster: null, reason: "no_tmdb_key" } as OutItem;

  // Prefer direct lookup by TMDB id when provided
  if (tmdbId) {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`;
    let res = await fetchJson(url);
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 400));
      res = await fetchJson(url);
    }
    if (res.ok) {
      const d = res.json as any;
      return { title: d?.title ?? title ?? null, poster: fromPosterPath(d?.poster_path), reason: d ? "ok" : "no_match" } as OutItem;
    }
    // fall through to search on failure
  }

  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`;
  let res = await fetchJson(url);
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 400));
    res = await fetchJson(url);
  }
  if (!res.ok) return { title, poster: null, reason: `tmdb_status_${res.status}` } as OutItem;

  const results = (res.json as any)?.results ?? [];
  let best = results[0];
  if (best && year) {
    best = results
      .slice()
      .sort((a: any, b: any) => {
        const ay = (a.release_date || "").slice(0, 4);
        const by = (b.release_date || "").slice(0, 4);
        const da = Math.abs((+ay || 0) - year);
        const db = Math.abs((+by || 0) - year);
        return da - db;
      })[0];
  }
  return {
    title: (best?.title as string) ?? title ?? null,
    poster: fromPosterPath(best?.poster_path),
    reason: best ? "ok" : "no_match",
  } as OutItem;
}

export async function POST(req: NextRequest) {
  // Parse input (support several shapes)
  const body = (await req.json().catch(() => ({}))) as InBody | Record<string, unknown>;

  let items: InItemFlexible[] = [];
  if (Array.isArray((body as any).ids)) {
    items = (body as any).ids.map((id: string) => ({ item_id: id }));
  } else if (Array.isArray((body as any).items)) {
    items = (body as any).items as InItemFlexible[];
  }

  if (!items.length) return NextResponse.json({ items: [] });

  const now = Date.now();
  const toFetch: InItemFlexible[] = [];
  const results: OutItem[] = new Array(items.length);

  // Try cache first
  items.forEach((it, i) => {
    const key = cacheKeyFromInput(it);
    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      results[i] = hit.value;
    } else {
      toFetch.push({ ...it, __index: i } as any);
    }
  });

  // Fetch missing
  await Promise.all(
    toFetch.map(async (it: any) => {
      const idx = it.__index as number;
      let out: OutItem;
      try {
        if (it.item_id) out = await getByImdb(it.item_id);
        else out = await getByTitleYear(it.title ?? "", it.year, it.tmdbId ?? null);
      } catch {
        out = { item_id: it.item_id, title: it.title ?? null, poster: null, reason: "error" } as OutItem;
      }
      const key = cacheKeyFromInput(it);
      cache.set(key, { expires: now + TTL_MS, value: out });
      results[idx] = out;
    })
  );

  // Always return a consistent shape: { items: OutItem[] }
  return NextResponse.json({ items: results });
}