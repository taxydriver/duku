import RateSearch from "@/components/rating/RateSearch";
import { RatingGrid } from "@/components/rating/RatingGrid";

export default function RatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Rate Movies</h1>
      <p className="text-muted-foreground">Search or rate popular picks to train your profile.</p>
      <RateSearch />
      <div className="border-t pt-4">
        <h2 className="text-lg font-medium mb-2">Popular</h2>
        <RatingGrid />
      </div>
    </div>
  );
}