'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AlgoClient() {
  const router = useRouter();

  const [algo, setAlgo] = useState<'mf_als' | 'cf_itemknn'>('mf_als');
  const [limit, setLimit] = useState(30);
  const [seed, setSeed] = useState('');

  const [ser, setSer] = useState(0.2);
  const [explore, setExplore] = useState(0.2);
  const [novel, setNovel] = useState(0.2);

  const needsSeed = algo === 'cf_itemknn';
  const canGo = !needsSeed || seed.trim().length > 0;

  const serPct = useMemo(() => Math.round(ser * 100), [ser]);
  const explorePct = useMemo(() => Math.round(explore * 100), [explore]);
  const novelPct = useMemo(() => Math.round(novel * 100), [novel]);

  const go = () => {
    const qs = new URLSearchParams();
    qs.set('algo', algo);
    qs.set('limit', String(limit));
    qs.set('ser', String(ser));
    qs.set('explore', String(explore));
    qs.set('novel', String(novel));
    if (needsSeed && seed.trim()) {
      qs.set('seed_item_id', seed.trim());
    }
    router.push(`/recs?${qs.toString()}`);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Algorithms</h1>
        <p className="text-sm text-muted-foreground">
          Choose a recommendation algorithm and tweak weights. Item-KNN needs an IMDb seed id
          (e.g., <code>tt1375666</code> for <em>Inception</em>).
        </p>
      </header>

      {/* Algorithm picker */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="font-medium">Algorithm</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="algo"
              value="mf_als"
              checked={algo === 'mf_als'}
              onChange={() => setAlgo('mf_als')}
            />
            <span>Matrix Factorization (ALS)</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="algo"
              value="cf_itemknn"
              checked={algo === 'cf_itemknn'}
              onChange={() => setAlgo('cf_itemknn')}
            />
            <span>Item KNN (needs seed)</span>
          </label>
        </div>

        {needsSeed && (
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mt-2">
            <div>
              <label className="block text-sm mb-1">IMDb seed id</label>
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="e.g. tt1375666"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                inputMode="text"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setSeed('tt1375666')}
              >
                Use Inception
              </button>
              <button
                type="button"
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setSeed('tt0133093')}
              >
                Use The Matrix
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Weights & limit */}
      <section className="rounded-xl border p-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm mb-1">Serendipity ({serPct}%)</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={ser}
            onChange={(e) => setSer(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Explore ({explorePct}%)</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={explore}
            onChange={(e) => setExplore(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Novelty ({novelPct}%)</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={novel}
            onChange={(e) => setNovel(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Limit</label>
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            className="w-32 rounded-md border px-3 py-2"
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          className={`rounded-md px-4 py-2 text-white ${canGo ? 'bg-black hover:opacity-90' : 'bg-gray-400 cursor-not-allowed'}`}
          onClick={go}
          disabled={!canGo}
        >
          See recommendations
        </button>
        {!canGo && (
          <span className="text-sm text-muted-foreground">Enter an IMDb id to continue.</span>
        )}
      </div>
    </div>
  );
}