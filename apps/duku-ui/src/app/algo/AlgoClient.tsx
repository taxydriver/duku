'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AlgoClient() {
  const router = useRouter();

  const [algo, setAlgo] = useState<'mf_als' | 'cf_itemknn'>('mf_als');
  const [limit, setLimit] = useState(30);
  const [seed, setSeed] = useState('');

  const [ser, setSer] = useState(0.2);
  const [explore, setExplore] = useState(0.2);
  const [novel, setNovel] = useState(0.2);

  const go = () => {
    const qs = new URLSearchParams();
    qs.set('algo', algo);
    qs.set('limit', limit.toString());
    qs.set('ser', ser.toString());
    qs.set('explore', explore.toString());
    qs.set('novel', novel.toString());
    if (algo === 'cf_itemknn' && seed.trim()) qs.set('seed_item_id', seed.trim());
    router.push(`/recs?${qs.toString()}`);
  };

  const needsSeed = algo === 'cf_itemknn';

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Choose algorithm</h1>
      {/* ... keep your existing controls/inputs here ... */}
      <button className="btn btn-primary" onClick={go}>
        See recommendations
      </button>
    </div>
  );
}