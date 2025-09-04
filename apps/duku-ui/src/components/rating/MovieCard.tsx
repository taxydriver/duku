// apps/duku-ui/src/components/rating/MovieCard.tsx
"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchJSON } from "@/lib/http";

export function MovieCard({ movie, mode }: { movie: any; mode?: "rating" | "recs" }) {
  const rate = async (value: number) => {
    try {
      await fetchJSON("/api/ratings", {
        method: "POST",
        body: JSON.stringify({ movieId: movie.id, value }),
      });
      toast.success("Rating saved");
    } catch (err: any) {
      toast.error(`Failed to rate: ${err.message ?? "Unknown error"}`);
    }
  };

  return (
    <Card>
  <CardContent className="p-0">
    <div className="aspect-[2/3] bg-muted overflow-hidden flex items-center justify-center">
      {movie.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-sm px-2 text-center">{movie.title}</span>
      )}
    </div>
    <div className="p-3 flex gap-2 justify-between">
      {mode === "rating" ? (
        <>
          <Button size="sm" onClick={() => rate(-1)}>👎</Button>
          <Button size="sm" onClick={() => rate(1)}>👍</Button>
          <Button size="sm" onClick={() => rate(5)}>⭐️</Button>
        </>
      ) : (
        <>
          <Button size="sm">Save</Button>
          <Button size="sm" variant="secondary">More like this</Button>
        </>
      )}
    </div>
  </CardContent>
</Card>
  );
}