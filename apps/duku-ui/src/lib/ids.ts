// apps/duku-ui/src/lib/ids.ts
export function itemIdOf(m: any): string {
  return (
    m?.item_id ??
    m?.id ??
    m?.imdb_id ??
    m?.imdbId ??
    m?.movieId ??
    ""
  );
}