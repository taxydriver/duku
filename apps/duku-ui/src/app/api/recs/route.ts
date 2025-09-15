// apps/duku-ui/src/app/api/recs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Force dynamic execution so Next.js doesn't try to prerender
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERLIN_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";

async function getOrCreateSessionId() {
  const jar = await cookies();
  let id = jar.get("duku_uid")?.value;
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    jar.set("duku_uid", id, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return id;
}

async function posterForImdb(imdbId: string) {
  if (!TMDB_API_KEY) return { item_id: imdbId, title: null as string | null, poster: null as string | null };
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
      poster: movie?.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
    };
  } catch {
    return { item_id: imdbId, title: null, poster: null };
  }
}

export async function GET(req: NextRequest) {
  // support simple seed-based recs via querystring for quick smoke tests
  const url = new URL(req.url);
  const seed_item_id = url.searchParams.get("seed") ?? undefined;
  const algo = (url.searchParams.get("algo") ?? "mf_als").toLowerCase();
  const k = Math.max(1, Math.min(50, Number(url.searchParams.get("k") ?? "20")) || 20);

  const jar = await cookies();
  const user_id = jar.get("duku_user_id")?.value ?? undefined;
  const session_id = await getOrCreateSessionId();

  const body = {
    user_id,
    session_id,
    seed_item_id,
    algo,
    k,
  };

  try {
    const r = await fetch(`${MERLIN_BASE}/api/v1/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) return NextResponse.json({ error: text }, { status: r.status });

    const json = JSON.parse(text) as {
      items?: Array<{ item_id: string; score: number }>;
      model_id?: string;
      version?: string;
    };

    const items = Array.isArray(json.items) ? json.items : [];
    const withPosters = await Promise.all(
      items.map(async (it) => {
        const meta = await posterForImdb(it.item_id);
        return { ...meta, score: it.score };
      })
    );

    // Return a plain array for client simplicity
    return NextResponse.json(withPosters);
  } catch (err) {
    console.error("/api/recs upstream error", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  // Mirror GET but accept JSON body from client components
  const payload = await req.json().catch(() => ({} as any));
  const algo = (payload.algo ?? "mf_als").toLowerCase();
  const k = Math.max(1, Math.min(50, Number(payload.k ?? 20) || 20));

  const jar = await cookies();
  const user_id = jar.get("duku_user_id")?.value ?? undefined;
  const session_id = await getOrCreateSessionId();

  const body = {
    user_id,
    session_id,
    seed_item_id: payload.seed_item_id,
    algo,
    k,
  };

  try {
    const r = await fetch(`${MERLIN_BASE}/api/v1/recommend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await r.text();
    if (!r.ok) return NextResponse.json({ error: text }, { status: r.status });

    const json = JSON.parse(text) as { items?: Array<{ item_id: string; score: number }> };
    const items = Array.isArray(json.items) ? json.items : [];

    const withPosters = await Promise.all(
      items.map(async (it) => {
        const meta = await posterForImdb(it.item_id);
        return { ...meta, score: it.score };
      })
    );

    return NextResponse.json(withPosters);
  } catch (err) {
    console.error("/api/recs upstream error", err);
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
}
