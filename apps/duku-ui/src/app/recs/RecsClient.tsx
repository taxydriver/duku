'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { MovieCard } from '@/components/rating/MovieCard';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type RecItem = {
  item_id?: string;
  title?: string;
  year?: number;
  tmdbId?: number | null;
  posterUrl?: string | null;
  [k: string]: unknown;
};

export default function RecsClient() {
  const sp = useSearchParams();
  const algo = sp.get('algo') ?? 'mf_als';
  const limit = Number(sp.get('limit') ?? 30);
  const ser = Number(sp.get('ser') ?? 0.2);
  const explore = Number(sp.get('explore') ?? 0.2);
  const novel = Number(sp.get('novel') ?? 0.2);
  const seed_item_id = sp.get('seed_item_id') ?? '';

  const qs = new URLSearchParams({
    algo,
    limit: String(limit),
    ser: String(ser),
    explore: String(explore),
    novel: String(novel),
  });
  if (seed_item_id) qs.set('seed_item_id', seed_item_id);
  if (seed_item_id && !qs.get('seed')) qs.set('seed', seed_item_id);

  const { data, error, isLoading } = useSWR<{ items: RecItem[] }>(
    `/api/recs?${qs.toString()}`,
    fetcher
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const [withPosters, setWithPosters] = useState<RecItem[]>(items);

  useEffect(() => {
    let cancelled = false;

    async function enrich() {
      if (!items.length) return setWithPosters([]);

      if (items.some((m) => m.posterUrl)) return setWithPosters(items);

      try {
        const canBulk = items.every((m) => (m.title || m.tmdbId) && m.year);
        if (canBulk) {
          const body = {
            items: items.map((m: any) => ({
              title: m.title ?? null,
              year: m.year ?? null,
              tmdbId: m.tmdbId ?? null,
            })),
          };
          const r = await fetch('/api/tmdb/posters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const pj = r.ok ? await r.json() : { posters: [] };
          const map = new Map<string, string | null>();
          (pj.posters ?? []).forEach((p: any) => map.set(p.key, p.posterUrl));
          const merged = items.map((m: any) => {
            const k =
              m.title ? `${m.title}${m.year ? ` (${m.year})` : ''}` : String(m.tmdbId ?? '');
            return { ...m, posterUrl: map.get(k) ?? m.posterUrl ?? null };
          });
          if (!cancelled) setWithPosters(merged);
          return;
        }

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
      <div className="text-sm text-muted-foreground">
        algo=<b>{algo}</b> limit={limit} ser={ser} explore={explore} novel={novel}
        {seed_item_id ? <> &nbsp; seed={seed_item_id}</> : null}
      </div>

      {!withPosters.length ? (
        <div className="text-sm text-muted-foreground">
          No results. Try a different algorithm or seed.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {withPosters.map((m, i) => (
            <MovieCard key={(m.item_id ?? i) + ':' + i} movie={m} mode="rating" />
          ))}
        </div>
      )}
    </div>
  );
}