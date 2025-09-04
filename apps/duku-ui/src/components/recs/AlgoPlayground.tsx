// apps/duku-ui/src/components/recs/AlgoPlayground.tsx
"use client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { KnobsPanel } from "./Knobs";
import { MovieCard } from "../rating/MovieCard";
import { usePosters } from "@/lib/userPosters";

type Algo = "CF" | "DeepFM" | "MMoE" | "DCNv2";
const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function AlgoPlayground() {
  const [algo, setAlgo] = useState<Algo>("CF");
  const [ser, setSer] = useState(0.2);
  const [explore, setExplore] = useState(0.1);
  const [novel, setNovel] = useState(0.2);

  // clamp (defensive)
  const c = (x: number) => Math.max(0, Math.min(1, x));
  const qs = useMemo(
    () =>
      new URLSearchParams({
        algo,
        ser: String(c(ser)),
        explore: String(c(explore)),
        novel: String(c(novel)),
        limit: "30",
      }).toString(),
    [algo, ser, explore, novel]
  );

  const { data, isLoading, error } = useSWR(`/api/recs?${qs}`, fetcher, {
    onError: (err) => toast.error(`Failed to load recommendations: ${err?.message ?? err}`),
  });

  const items = (data?.items as any[]) ?? [];
  // ⬇️ add posters here
  const withPosters = usePosters(items);

  return (
    <div className="space-y-6">
      <KnobsPanel
        algo={algo} setAlgo={setAlgo}
        ser={ser} setSer={setSer}
        explore={explore} setExplore={setExplore}
        novel={novel} setNovel={setNovel}
      />

      {error && <div className="text-sm text-red-500">Failed to load recommendations.</div>}
      {isLoading && <div className="text-sm text-muted-foreground">Loading recommendations…</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {withPosters.map((m: any) => (
          <MovieCard key={m.id} movie={m} mode="recs" />
        ))}
      </div>
    </div>
  );
}