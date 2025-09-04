"use client";
import useSWR from "swr";
import { MovieCard } from "@/components/rating/MovieCard";
import { usePosters } from "@/lib/userPosters";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function RecsPage() {
  const { data, isLoading, error } = useSWR("/api/recs?algo=CF&ser=0.2&explore=0.1&novel=0.2", fetcher);
  const items = data?.items ?? [];
  const withPosters = usePosters(items);

  if (error) return <div className="text-sm text-red-500">Failed to load recommendations.</div>;
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading recommendations…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recommendations</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {withPosters.map((m: any) => <MovieCard key={m.id} movie={m} mode="recs" />)}
      </div>
    </div>
  );
}