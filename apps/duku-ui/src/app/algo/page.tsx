// apps/duku-ui/src/app/algo/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AlgoPage() {
  const router = useRouter();

  // core algo inputs
  const [algo, setAlgo] = useState<"mf_als" | "cf_itemknn">("mf_als");
  const [limit, setLimit] = useState(30);
  const [seed, setSeed] = useState("");

  // new knobs (0..1)
  const [ser, setSer] = useState(0.2);      // serendipity
  const [explore, setExplore] = useState(0.1);
  const [novel, setNovel] = useState(0.2);

  const run = () => {
    const qs = new URLSearchParams();
    qs.set("algo", algo);
    qs.set("limit", String(limit));
    // pass the knobs as floats (backend can default if not used)
    qs.set("ser", ser.toString());
    qs.set("explore", explore.toString());
    qs.set("novel", novel.toString());
    if (algo === "cf_itemknn" && seed.trim()) qs.set("seed_item_id", seed.trim());
    router.push(`/recs?${qs.toString()}`);
  };

  const needsSeed = algo === "cf_itemknn";

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Choose algorithm</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Algorithm</label>
        <select
          value={algo}
          onChange={(e) => setAlgo(e.target.value as any)}
          className="border rounded px-2 py-1 w-full"
        >
          <option value="mf_als">ALS (personalized)</option>
          <option value="cf_itemknn">Item KNN (seeded)</option>
        </select>
      </div>

      {needsSeed && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Seed item id</label>
          <input
            className="border rounded px-2 py-1 w-full"
            placeholder="e.g., 50 (MovieLens movieId)"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Note: current KNN model uses MovieLens movieIds (not IMDb tt…).
          </p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium">Limit</label>
        <input
          type="number"
          min={1}
          max={100}
          className="border rounded px-2 py-1 w-32"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </div>

      {/* --- New knobs --- */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Serendipity</label>
            <span className="text-xs tabular-nums">{ser.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={ser}
            onChange={(e) => setSer(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">Blend in surprising-but-relevant items.</p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Explore</label>
            <span className="text-xs tabular-nums">{explore.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={explore}
            onChange={(e) => setExplore(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">Inject diversity / widen the search space.</p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Novelty</label>
            <span className="text-xs tabular-nums">{novel.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={novel}
            onChange={(e) => setNovel(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">Prefer items less seen overall.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={needsSeed && !seed.trim()}
        className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        See recommendations
      </button>
    </div>
  );
}