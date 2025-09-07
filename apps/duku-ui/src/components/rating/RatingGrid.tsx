// apps/duku-ui/src/components/rating/RatingGrid.tsx
"use client";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { MovieCard } from "./MovieCard";
import { itemIdOf } from "@/lib/ids";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type PopularItem = {
  item_id?: string; // canonical (IMDb tt…)
  title?: string;
  year?: number;
  tmdbId?: number | null;
  // legacy fields we normalize via itemIdOf()
  id?: string;
  imdb_id?: string;
  imdbId?: string;
  movieId?: string;
};

type UserRating = { item_id: string; value: number };

export function RatingGrid() {
  // 1) Identity (server reads cookies)
  const { data: auth } = useSWR<{ user_id: string | null; session_id: string | null }>(
    "/api/auth/state",
    fetcher,
    { revalidateOnFocus: false }
  );

  const identityKey = useMemo(
    () =>
      auth?.user_id ? `u:${auth.user_id}` :
      auth?.session_id ? `s:${auth.session_id}` :
      "anon",
    [auth?.user_id, auth?.session_id]
  );

  // 2) Ratings for current identity (key separates caches; fetcher hits cookie-driven route)
  const ratingsKey = `/api/user/ratings?who=${encodeURIComponent(identityKey)}`;
  const { data: ur } = useSWR<UserRating[]>(
    auth ? ratingsKey : null,
    () => fetch("/api/user/ratings").then((r) => r.json()),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const ratingMap = useMemo(() => {
    const m = new Map<string, number>();
    (ur ?? []).forEach((r) => m.set(r.item_id, r.value));
    return m;
  }, [ur]);

   useEffect(() => {
    console.log("[RatingGrid] identity", { auth, identityKey });
  }, [identityKey, auth]);

  // 3) Popular items (UI proxy already enriches with posters when possible)
  const { data: pop } = useSWR<{ items: PopularItem[] }>("/api/movies/popular", fetcher);
  const items: PopularItem[] = pop?.items ?? [];

  // 4) Merge posters + inject initialValue from ratingMap
  const [withPosters, setWithPosters] = useState<any[]>(items);

  useEffect(() => {
    let cancelled = false;

    async function enrich() {
      if (!items.length) {
        setWithPosters([]);
        return;
      }

      try {
        // ask poster proxy for URLs (by title/year/tmdbId)
        const body = {
          items: items.map((m) => ({
            title: (m as any).title,
            year: (m as any).year,
            tmdbId: (m as any).tmdbId ?? null,
          })),
        };

        const r = await fetch("/api/tmdb/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const postersJson = r.ok ? await r.json() : { posters: [] };
        const posters = postersJson?.posters ?? [];
        const posterMap = new Map<string, string | null>();
        posters.forEach((p: any) => posterMap.set(p.key, p.posterUrl));

        const merged = items.map((m) => {
          const itemId = itemIdOf(m); // ✅ normalize once
          const k = `${(m as any).title ?? ""}${
            (m as any).year ? ` (${(m as any).year})` : ""
          }`;

          const iv =
            itemId && ratingMap.has(itemId)
              ? (ratingMap.get(itemId) as number)
              : 0; // ✅ strict fallback

          // debug (remove later)
          console.log("[merge item]", { title: m.title, itemId, iv });

          return {
            ...m,
            item_id: itemId,
            posterUrl: posterMap.get(k) ?? (m as any).posterUrl ?? null,
            initialValue: iv,
          };
        });

        if (!cancelled) setWithPosters(merged);
      } catch {
        // fallback: normalize ids and ratings without poster refresh
        const merged = items.map((m) => {
          const itemId = itemIdOf(m);
          const iv =
            itemId && ratingMap.has(itemId)
              ? (ratingMap.get(itemId) as number)
              : 0;
          return { ...m, item_id: itemId, initialValue: iv };
        });
        if (!cancelled) setWithPosters(merged);
      }
    }

    enrich();
    return () => { cancelled = true; };
  }, [JSON.stringify(items), JSON.stringify(ur ?? []), identityKey]);

  // 5) Key the grid by identity so cards remount on sign-in/out
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" key={identityKey}>
      {withPosters.map((m) => (
        <MovieCard key={m.item_id} movie={m} mode="rating" />
      ))}
    </div>
  );
}