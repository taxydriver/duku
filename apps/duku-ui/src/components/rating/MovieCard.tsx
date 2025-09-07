// apps/duku-ui/src/components/rating/MovieCard.tsx
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
  useEffect(() => {
    console.log("[MovieCard mount/update]", {
      title: movie.title,
      itemId,
      initialValue: movie.initialValue,
    });
    setSelected(movie.initialValue ?? 0);
  }, [movie.initialValue, itemId, movie.title]);

  // toggle like
  const toggleLike = async () => {
    console.log("[toggleLike click]", { itemId, selected });
    if (!itemId) {
      toast.error("Missing item id");
      return;
    }

    if (selected !== 1) {
       console.log("[UI] Like -> POST /api/ratings", { item_id: itemId, event_type: "like" });
      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          //body: JSON.stringify({ item_id: itemId, event_type: "like" }),
          body: JSON.stringify({ item_id: itemId, event_type: "like", context: { value: 1 } }), // extra context for Merlin
        });
        const json = await res.json();
        console.log("[toggleLike backend response]", { status: res.status, json });
        if (!res.ok) throw new Error(json?.error ?? "Failed");

        setSelected(1);
        mutate(
          ratingsKey,
          (prev: Array<{ item_id: string; value: number }> | undefined) => {
            console.log("[mutate add like]", { prevCount: Array.isArray(prev) ? prev.length : 0, add: { item_id: itemId, value: 1 } });
            const base = Array.isArray(prev) ? prev : [];
            const without = base.filter((r) => r.item_id !== itemId);
            return [...without, { item_id: itemId, value: 1 }];
          },
          false
        );
        toast.success("Liked");
      } catch (err: any) {
        toast.error(`Failed to like: ${err?.message ?? "Unknown error"}`);
      }
    } else {
      console.log("[toggleLike turn off]", { itemId });
      await fetch("/api/ratings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item_id: itemId, event_type: "like", context: { value: 0 } }),
        });
      setSelected(0);
      mutate(
        ratingsKey,
        (prev: Array<{ item_id: string; value: number }> | undefined) => {
          console.log("[mutate remove like]", { prev, remove: itemId });
          const base = Array.isArray(prev) ? prev : [];
          return base.filter((r) => r.item_id !== itemId);
        },
        false
      );
    }
  };

  const isLike = selected === 1;

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={isLike}
        className={`aspect-[2/3] w-full relative transition ${
          isLike ? "ring-4 ring-green-500 ring-offset-2 ring-offset-background" : "hover:opacity-90"
        }`}
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
            className={`px-2 py-1 rounded border text-xs transition ${
              isLike ? "bg-green-600 text-white" : "hover:bg-accent"
            }`}
          >
            {isLike ? "Liked" : "Like"}
          </button>
        )}
      </div>
    </div>
  );
}