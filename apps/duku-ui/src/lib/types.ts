export type MovieId = string;
export type UserId = string;

export type Movie = {
  id: MovieId;
  title: string;
  year?: number;
  posterUrl?: string;
  genres?: string[];
  overview?: string;
};

export type Rating = {
  userId: UserId;
  movieId: MovieId;
  value: -1 | 0 | 1 | 2 | 3 | 4 | 5;
  ratedAt?: string; // ISO
};

export type Algo = "CF" | "DeepFM" | "MMoE" | "DCNv2";

export type Knobs = {
  serendipity: number;   // 0..1
  explore: number;       // 0..1
  novelty: number;       // 0..1
};

export type RecRequest = {
  userId: UserId;
  algo: Algo;
  knobs: Knobs;
  limit?: number;
};

export type RecResponse = {
  algo: Algo;
  items: Movie[];
  explain?: Record<string, string>;
};
