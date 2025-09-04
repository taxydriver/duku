// apps/duku-ui/src/components/rating/RatingGrid.tsx
"use client";
import useSWR from "swr";
import { useEffect, useState } from "react";
import { MovieCard } from "./MovieCard";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function RatingGrid() {
  const { data } = useSWR("/api/movies/popular", fetcher);
  const items: any[] = data?.items ?? [];
  const [withPosters, setWithPosters] = useState<any[]>(items);

  useEffect(() => {
    let cancelled = false;
    async function enrich() {
      if (!items.length) { setWithPosters([]); return; }
      try {
        const body = {
          items: items.map(m => ({
            title: m.title,
            year: m.year,
            tmdbId: m.tmdbId ?? null, // << prefer exact mapping
          })),
        };
        const r = await fetch("/api/tmdb/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const { posters } = await r.json();
        const map = new Map<string, string | null>();
        posters.forEach((p: any) => map.set(p.key, p.posterUrl));
        const merged = items.map(m => {
          const k = `${m.title}${m.year ? ` (${m.year})` : ""}`;
          return { ...m, posterUrl: map.get(k) ?? null };
        });
        if (!cancelled) setWithPosters(merged);
      } catch {
        if (!cancelled) setWithPosters(items);
      }
    }
    enrich();
    return () => { cancelled = true; };
  }, [JSON.stringify(items)]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {withPosters.map((m) => <MovieCard key={m.id} movie={m} mode="rating" />)}
    </div>
  );
}