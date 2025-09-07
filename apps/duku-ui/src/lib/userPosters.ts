"use client";
import { useEffect, useState } from "react";

export type MovieLite = {
  title: string;
  year?: number;
  tmdbId?: number | null;
  // allow any other fields
  [k: string]: any;
};

export function usePosters<T extends MovieLite>(items: T[]) {
  const [enriched, setEnriched] = useState<T[]>(items);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      console.log("[UI] Posters: preparing batch", { count: items.length });
      if (!items?.length) { setEnriched([]); return; }

      try {
        const body = {
          items: items.map(m => ({
            title: m.title,
            year: m.year,
            tmdbId: m.tmdbId ?? null,
          })),
        };

        const r = await fetch("/api/tmdb/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        console.log("[UI] Posters: response status", r.status);
        const { posters } = await r.json(); // [{ key, posterUrl }]
        console.log("[UI] Posters: got", posters.length);
        const map = new Map<string, string | null>();
        (posters ?? []).forEach((p: any) => map.set(p.key, p.posterUrl));

        const merged = items.map(m => {
          const k = `${m.title}${m.year ? ` (${m.year})` : ""}`;
          return { ...m, posterUrl: map.get(k) ?? null } as T & { posterUrl?: string | null };
        });

        if (!cancelled) setEnriched(merged);
      } catch {
        if (!cancelled) setEnriched(items);
      }
    })();

    return () => { cancelled = true; };
  }, [JSON.stringify(items)]); // simple change detector

  return enriched;
}