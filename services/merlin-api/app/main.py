from __future__ import annotations
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pathlib import Path
import pandas as pd
import random
import time
from enum import Enum
from typing import List, Optional, Dict

app = FastAPI(title="Merlin API (Duku)")

# CORS (for local dev; lock down later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ---------- Data loading ----------
DATA_DIR = Path(__file__).resolve().parent / "data"
MOVIES_CSV = DATA_DIR / "movies.csv"   # ML-25M
LINKS_CSV  = DATA_DIR / "links.csv"    # ML-25M
RATINGS_CSV = DATA_DIR / "ratings.csv" # (optional, huge) not required
LOCAL_RATINGS = DATA_DIR / "ratings_local.csv"  # we append user ratings here

if not MOVIES_CSV.exists() or not LINKS_CSV.exists():
    raise RuntimeError(
        f"Place MovieLens CSVs here:\n  {MOVIES_CSV}\n  {LINKS_CSV}\n"
        "Download from https://grouplens.org/datasets/movielens/25m/"
    )

movies_df = pd.read_csv(MOVIES_CSV)              # movieId,title,genres
links_df  = pd.read_csv(LINKS_CSV)               # movieId,imdbId,tmdbId
movies_df = movies_df.merge(links_df, on="movieId", how="left")

def parse_title_year(title: str):
    # MovieLens titles look like: "Toy Story (1995)"
    year = None
    if title.endswith(")") and "(" in title:
        try:
            year = int(title.split("(")[-1].strip(")"))
        except Exception:
            year = None
    clean = title.rsplit("(", 1)[0].strip() if year else title
    return clean, year

movies_df["year"] = movies_df["title"].apply(lambda t: parse_title_year(t)[1])
movies_df["cleanTitle"] = movies_df["title"].apply(lambda t: parse_title_year(t)[0])

# basic popularity proxy (if you have ratings.csv, you can compute counts)
if RATINGS_CSV.exists():
    counts = pd.read_csv(RATINGS_CSV, usecols=["movieId"])
    pop = counts.value_counts().rename_axis("movieId").reset_index(name="count")
    movies_df = movies_df.merge(pop, on="movieId", how="left")
    movies_df["pop"] = movies_df["count"].fillna(0)
else:
    movies_df["pop"] = 1.0  # flat if ratings.csv not present

# in-memory ratings store by user
# (also append to LOCAL_RATINGS for persistence across restarts)
user_ratings: Dict[str, Dict[int, float]] = {}

# ---------- Schemas ----------
class Movie(BaseModel):
    id: int = Field(..., description="MovieLens movieId")
    title: str
    year: Optional[int] = None
    genres: Optional[str] = None
    tmdbId: Optional[int] = None

class RatingIn(BaseModel):
    userId: str = Field(..., description="guest-xxxx or auth user id")
    movieId: int
    value: float = Field(..., ge=0, le=5)

class RatingOut(BaseModel):
    ok: bool

class Algo(str, Enum):
    CF = "CF"
    DeepFM = "DeepFM"
    MMoE = "MMoE"
    DCNv2 = "DCNv2"

# ---------- Helpers ----------
def df_to_movies(rows: pd.DataFrame) -> List[Movie]:
    return [
        Movie(
            id=int(r.movieId),
            title=str(r.cleanTitle if pd.notna(r.cleanTitle) else r.title),
            year=int(r.year) if pd.notna(r.year) else None,
            genres=str(r.genres) if pd.notna(r.genres) else None,
            tmdbId=int(r.tmdbId) if pd.notna(r.tmdbId) else None,
        )
        for _, r in rows.iterrows()
    ]

def unseen_mask(df: pd.DataFrame, seen: set[int]) -> pd.Series:
    return ~df["movieId"].isin(seen)

def novelty_score(df: pd.DataFrame) -> pd.Series:
    # toy proxy: inverse popularity
    p = df["pop"].fillna(0) + 1.0
    return 1.0 / p

def diversity_boost(df: pd.DataFrame) -> pd.Series:
    # count distinct genres per movie
    gcounts = df["genres"].fillna("").apply(
        lambda g: len(set(g.split("|"))) if g else 0
    ).astype(float)

    # denominator must be >= 1 and not NaN
    max_g = float(gcounts.max() if pd.notna(gcounts.max()) else 0.0)
    denom = max(1.0, max_g)

    return (gcounts / denom).fillna(0.0)

# ---------- Routes ----------
@app.get("/health")
def health():
    return {"ok": True, "t": int(time.time())}

@app.get("/movies/popular", response_model=List[Movie])
def popular_movies(limit: int = 20):
    rows = movies_df.sort_values("pop", ascending=False).head(limit)
    return df_to_movies(rows)

@app.get("/movies/search", response_model=List[Movie])
def search_movies(q: str, limit: int = 20):
    q = q.strip().lower()
    if not q:
        return []
    mask = movies_df["cleanTitle"].str.lower().str.contains(q, na=False) | \
           movies_df["genres"].str.lower().str.contains(q, na=False)
    rows = movies_df[mask].head(limit)
    return df_to_movies(rows)

@app.post("/ratings", response_model=RatingOut)
def post_rating(r: RatingIn):
    user_ratings.setdefault(r.userId, {})[r.movieId] = float(r.value)
    # append to local CSV (fire-and-forget)
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        header = not LOCAL_RATINGS.exists()
        pd.DataFrame([{
            "userId": r.userId,
            "movieId": r.movieId,
            "value": r.value,
            "ts": int(time.time())
        }]).to_csv(LOCAL_RATINGS, mode="a", header=header, index=False)
    except Exception:
        pass
    return RatingOut(ok=True)

@app.get("/recs", response_model=List[Movie])
def recs(
    userId: str = "guest",
    algo: Algo = Algo.CF,      # "CF" | "DeepFM" | "MMoE" | "DCNv2" (labels only for now)
    ser: float = 0.2,       # serendipity 0..1
    explore: float = 0.1,   # exploration 0..1
    novel: float = 0.2,     # novelty 0..1
    limit: int = 20
):
    """
    Heuristic stub:
    - Start from popularity.
    - Remove items the user has rated.
    - Blend in novelty & diversity according to knobs.
    - Add some exploration noise.
    """
    rated = set(user_ratings.get(userId, {}).keys())

    df = movies_df.copy()
    df = df[unseen_mask(df, rated)]

    # base score: popularity
    score = df["pop"].fillna(0).astype(float)

    # novelty & diversity
    score = (1 - novel) * score + novel * (novelty_score(df) * 100.0)
    score = (1 - ser) * score + ser * (diversity_boost(df) * 50.0)

    # exploration: add noise
    if explore > 0:
        rng = pd.Series([random.random() for _ in range(len(df))], index=df.index)
        score = (1 - explore) * score + explore * rng * score.mean()

    df = df.assign(score=score).sort_values("score", ascending=False).head(limit)
    return df_to_movies(df)