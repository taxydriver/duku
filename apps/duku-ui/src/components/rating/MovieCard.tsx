"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import Image from "next/image";
import { toast } from "sonner";
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

  // ✅ canonical id
  const itemId = useMemo(() => itemIdOf(movie), [movie]);

  // hydrate local state
  const [selected, setSelected] = useState<number>(movie.initialValue ?? 0);
  const [pending, setPending] = useState(false);
  // Initialize from server state only on first mount / when the item changes.
  useEffect(() => {
    setSelected(movie.initialValue ?? 0);
    // (Optional) console for first mount per item:
    // console.log("[MovieCard init]", { title: movie.title, itemId, initialValue: movie.initialValue });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // If server later reports a like and we haven't got one locally, gently sync up.
  useEffect(() => {
    if (!pending && (movie.initialValue ?? 0) === 1 && selected === 0) {
      setSelected(1);
    }
  }, [movie.initialValue, pending, selected]);

  const optimisticMutate = (val: 0 | 1) => {
    mutate(
      ratingsKey,
      (prev: Array<{ item_id: string; value: number }> | undefined) => {
        const base = Array.isArray(prev) ? [...prev] : [];
        const i = base.findIndex(r => r.item_id === itemId);
        if (i >= 0) base[i] = { item_id: itemId!, value: val };
        else base.unshift({ item_id: itemId!, value: val });
        return val === 0 ? base.filter(r => r.item_id !== itemId) : base;
      },
      { revalidate: false }
    );
  };

  async function postLike(value: 0 | 1) {
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_id: itemId, event_type: "like", context: { value } }),
      cache: "no-store",
      keepalive: true,
    });
    return res;
  }

  const toggleLike = async () => {
    console.log("[toggleLike click]", { itemId, selected });
    if (!itemId || pending) {
      if (!itemId) toast.error("Missing item id");
      return;
    }

    const isLike = selected === 1;
    const nextVal: 0 | 1 = isLike ? 0 : 1;
    const prevVal: 0 | 1 = isLike ? 1 : 0;

    // Optimistic UI + cache
    setSelected(nextVal);
    optimisticMutate(nextVal);

    setPending(true);
    try {
      let res = await postLike(nextVal);

      // Gentle retry on 429 once
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 600));
        res = await postLike(nextVal);
      }

      if (!res.ok) {
        // Roll back
        setSelected(prevVal);
        optimisticMutate(prevVal);
        const msg = await res.text().catch(() => "");
        console.error("[toggleLike] backend failed", res.status, msg.slice(0, 200));
        toast.error("That was a bit fast—please try again.");
        return;
      }

      // Background revalidation to sync across tabs
      mutate(ratingsKey);
      if (nextVal === 1) toast.success("Liked");
    } catch (err) {
      // Roll back on network error
      setSelected(prevVal);
      optimisticMutate(prevVal);
      console.error("[toggleLike] network error", err);
      toast.error("Network hiccup—try again.");
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
        className={`aspect-[2/3] w-full relative transition ${
          isLike ? "ring-4 ring-green-500 ring-offset-2 ring-offset-background" : "hover:opacity-90"
        } ${pending ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {movie.posterUrl ? (
          <Image src={movie.posterUrl} alt={movie.title ?? "poster"} fill sizes="200px" className="object-cover" />
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
            className={`px-2 py-1 rounded border text-xs transition ${
              isLike ? "bg-green-600 text-white" : "hover:bg-accent"
            } ${pending ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {isLike ? "Liked" : "Like"}
          </button>
        )}
      </div>
    </div>
  );
}