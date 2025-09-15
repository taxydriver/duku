"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import Image from "next/image";
import { itemIdOf } from "@/lib/ids";

const fetcher = (u: string) => fetch(u).then(r => r.json());

type Movie = {
  item_id?: string;
  title?: string;
  year?: number;
  posterUrl?: string | null;
  initialValue?: number;
};

export function MovieCard({ movie, mode = "rating" }: { movie: Movie; mode?: "rating" | "view" }) {
  const { mutate } = useSWRConfig();

  // identity
  const { data: auth } = useSWR<{ user_id: string | null; session_id: string | null }>(
    "/api/auth/state",
    fetcher,
    { revalidateOnFocus: false }
  );
  const identityKey = auth?.user_id ? `u:${auth.user_id}` : auth?.session_id ? `s:${auth.session_id}` : "anon";
  const ratingsKey = `/api/user/ratings?who=${encodeURIComponent(identityKey)}`;

  // canonical id
  const itemId = useMemo(() => itemIdOf(movie), [movie]);

  // local like state
  const [selected, setSelected] = useState<number>(movie.initialValue ?? 0);
  const [pending, setPending] = useState(false);

  // initialize only when the movie changes
  useEffect(() => {
    setSelected(movie.initialValue ?? 0);
  }, [itemId]); // ← key by itemId so we don't clobber optimistic state

  

  const optimisticMutate = (val: 0 | 1) =>
    mutate(
      ratingsKey,
      (prev: Array<{ item_id: string; value: number }> | undefined) => {
        const base = Array.isArray(prev) ? [...prev] : [];
        const i = base.findIndex(r => r.item_id === itemId);
        if (val === 1) {
          if (i >= 0) base[i] = { item_id: itemId!, value: 1 };
          else base.unshift({ item_id: itemId!, value: 1 });
          return base;
        }
        // val === 0
        return base.filter(r => r.item_id !== itemId);
      },
      { revalidate: false } // ← no network refetch; prevents any visual “bounce”
    );

  async function postLike(value: 0 | 1) {
    return fetch("/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_id: itemId, event_type: "like", context: { value } }),
      cache: "no-store",
      keepalive: true,
    });
  }

  const toggleLike = async () => {
    if (!itemId || pending) {
      if (!itemId) console.error("[MovieCard] Missing item id");
      return;
    }
    const isLike = selected === 1;
    const nextVal: 0 | 1 = isLike ? 0 : 1;
    const prevVal: 0 | 1 = isLike ? 1 : 0;

    // optimistic
    setSelected(nextVal);
    optimisticMutate(nextVal);

    setPending(true);
    try {
      let res = await postLike(nextVal);
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 600));
        res = await postLike(nextVal);
      }
      if (!res.ok) {
        // rollback removed
        const msg = await res.text().catch(() => "");
        console.error("[toggleLike] backend failed", res.status, msg.slice(0, 200));
        // Keep optimistic UI; optionally you can surface a subtle inline indicator if desired.
        return;
      }
      
    } catch (err) {
      // rollback removed
      console.error("[toggleLike] network error", err);
      // Keeping optimistic UI to avoid flicker; consider retry logic if needed.
    } finally {
      setPending(false);
    }
  };

  const isLike = selected === 1;

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <button
        type="button"
        onClick={toggleLike}
        disabled={pending}
        aria-pressed={isLike}
        className={`aspect-[2/3] w-full relative ${
          isLike ? "ring-4 ring-green-500 ring-offset-2 ring-offset-background" : ""
        } ${pending ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {movie.posterUrl ? (
          <Image
            src={movie.posterUrl}
            alt={movie.title ?? "poster"}
            fill
            sizes="200px"
            className="object-cover"
            priority={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {movie.title ?? itemId}
          </div>
        )}
        {isLike && (
          <div className="absolute top-2 right-2 text-white text-lg drop-shadow">👍</div>
        )}
      </button>
      <div className="p-3 space-y-2">
        <div className="text-sm font-medium">{movie.title ?? itemId}</div>
        {mode === "rating" && (
          <button
            type="button"
            onClick={toggleLike}
            disabled={pending}
            className={`px-2 py-1 rounded border text-xs ${
              isLike ? "bg-green-600 text-white" : ""
            } ${pending ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isLike ? "Liked" : "Like"}
          </button>
        )}
      </div>
    </div>
  );
}