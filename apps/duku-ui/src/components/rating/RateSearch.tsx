// apps/duku-ui/src/components/rating/RateSearch.tsx
"use client";
import { useMemo, useState } from "react";
import { MovieCard } from "./MovieCard";
import { usePosters } from "@/lib/userPosters";

export default function RateSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // simple debounce
  const debounce = (fn: (...a: any[]) => void, ms = 400) => {
    let t: any;
    return (...args: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const doSearch = useMemo(
    () =>
      debounce(async (term: string) => {
        if (!term.trim()) {
          setItems([]);
          return;
        }
        setLoading(true);
        try {
          const r = await fetch(`/api/movies/search?q=${encodeURIComponent(term)}&limit=40`, {
            headers: { "Cache-Control": "no-cache" },
          });
          const data = await r.json();
          // Expect backend to return {title, year, tmdbId} (our FastAPI does)
          setItems(data.items ?? data ?? []);
        } finally {
          setLoading(false);
        }
      }, 400),
    []
  );

  // ⬅️ add posters here
  const withPosters = usePosters(items);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Search a movie or genre…"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            doSearch(v);
          }}
        />
      </div>

      {loading && <div className="text-sm text-muted-foreground">Searching…</div>}

      {!!withPosters.length && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {withPosters.map((m) => (
            <MovieCard key={m.id} movie={m} mode="rating" />
          ))}
        </div>
      )}
    </div>
  );
}