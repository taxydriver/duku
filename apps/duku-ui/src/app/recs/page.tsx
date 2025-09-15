// apps/duku-ui/src/app/recs/page.tsx
"use client";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useEffect, useMemo, useState , Suspense } from 'react';
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { MovieCard } from "@/components/rating/MovieCard";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type RecItem = {
  item_id?: string;
  title?: string;
  year?: number;
  tmdbId?: number | null;
  posterUrl?: string | null;
};

function RecsInner() {
  const sp = useSearchParams();
  const qs = sp.toString();
  const key = qs ? `/api/recs?${qs}` : null;

  const { data, error, isLoading } = useSWR<{ items: RecItem[] }>(
    key,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const [withPosters, setWithPosters] = useState<RecItem[]>(items);

  useEffect(() => {
  let cancelled = false;

  async function enrich() {
    if (!items.length) { setWithPosters([]); return; }

    // If any already have posterUrl, keep them
    if (items.some(m => m.posterUrl)) { setWithPosters(items); return; }

    try {
      // Bulk title/year route if you already have metadata (unchanged)
      const canBulk =
        items.some(m => typeof (m as any).title === "string") ||
        items.some(m => typeof (m as any).tmdbId === "number");

      if (canBulk) {
        const body = {
          items: items.map((m:any) => ({ title: m.title ?? null, year: m.year ?? null, tmdbId: m.tmdbId ?? null })),
        };
        const r = await fetch("/api/tmdb/posters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const pj = r.ok ? await r.json() : { posters: [] };
        const map = new Map<string, string | null>();
        (pj.posters ?? []).forEach((p: any) => map.set(p.key, p.posterUrl));
        const merged = items.map((m:any) => {
          const k = m.title ? `${m.title}${m.year ? ` (${m.year})` : ""}` : `${m.tmdbId ?? ""}`;
          return { ...m, posterUrl: map.get(k) ?? m.posterUrl ?? null };
        });
        if (!cancelled) setWithPosters(merged);
        return;
      }

      // Bulk IMDb → TMDB (new)
      const imdbIds = items.map(m => m.item_id).filter((id): id is string => !!id && id.startsWith("tt"));
      if (imdbIds.length) {
        const r = await fetch("/api/tmdb/find-bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imdb_ids: imdbIds }),
        });
        const j = r.ok ? await r.json() : { items: [] };
        const map = new Map<string, { title?: string|null; year?: number|null; poster?: string|null }>();
        (j.items ?? []).forEach((x: any) => map.set(String(x.imdbId), x));

        const merged = items.map((m) => {
          const meta = map.get(String(m.item_id ?? ""));
          return {
            ...m,
            title: m.title ?? (meta?.title ?? undefined),
            year: m.year ?? (meta?.year ?? undefined),
            posterUrl: m.posterUrl ?? (meta?.poster ?? null),
          };
        });

        if (!cancelled) setWithPosters(merged);
        return;
      }

      // Nothing else to enrich
      if (!cancelled) setWithPosters(items);
    } catch {
      if (!cancelled) setWithPosters(items);
    }
  }

  enrich();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [JSON.stringify(items)]);

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Failed to load: {String(error)}</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="text-xs text-muted-foreground">
        algo=<b>{sp.get("algo") ?? "mf_als"}</b>,
        ser={sp.get("ser") ?? "0.2"},
        explore={sp.get("explore") ?? "0.1"},
        novel={sp.get("novel") ?? "0.2"},
        limit={sp.get("limit") ?? "30"}
        {sp.get("seed_item_id") ? <> &nbsp; seed={sp.get("seed_item_id")}</> : null}
      </div>

      {!withPosters.length ? (
        <div className="text-sm text-muted-foreground">No results. Try a different algorithm or seed.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {withPosters.map((m, i) => (
            <MovieCard key={(m.item_id ?? i) + ":" + i} movie={m} mode="rating" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <RecsInner />
    </Suspense>
  );
}
