# services/merlin-api/app/cli/train_and_register.py
from __future__ import annotations

import argparse
import json
import os
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import psycopg
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from scipy.sparse import coo_matrix, csr_matrix
import implicit 

# ---------- env ----------
load_dotenv()  # loads services/merlin-api/.env when run from that working dir

DATABASE_URL = os.getenv("DATABASE_URL")
ARTIFACT_URI_BASE = os.getenv("ARTIFACT_URI_BASE", "file:///models/")

# Optional: MovieLens settings (used when --source=movielens)
MOVIELENS_DIR = os.getenv("MOVIELENS_DIR", "/app/data/movielens")  # path to extracted MovieLens files
IMPLICIT_THRESHOLD = float(os.getenv("IMPLICIT_THRESHOLD", "4.0"))  # ratings >= threshold count as positive
ITEMKNN_TOPK = int(os.getenv("ITEMKNN_TOPK", "200"))  # neighbors per item to retain

# ---------- helpers ----------
def _artifact_dir(model_id: str, version: str) -> str:
    # support file:// URIs; only local file scheme is implemented in this CLI
    if ARTIFACT_URI_BASE.startswith("file://"):
        base_path = ARTIFACT_URI_BASE[len("file://") :]
        return os.path.join(base_path, model_id, version)
    # Future: implement supabase:// or s3:// here
    raise ValueError(f"ARTIFACT_URI_BASE {ARTIFACT_URI_BASE} not supported by this CLI yet.")

def _fetch_catalog(conn) -> pd.DataFrame:
    sql = """
    select item_id, coalesce(title,'') as title, coalesce(overview,'') as overview,
           coalesce(genres, '{}') as genres
    from item_catalog
    """
    return pd.read_sql(sql, conn)

def _build_content_vectors(df: pd.DataFrame) -> Dict[str, np.ndarray]:
    # Concatenate title + overview + genres for simple content signal
    text = (
        df["title"].astype(str)
        + " "
        + df["overview"].astype(str)
        + " "
        + df["genres"].apply(lambda g: " ".join(g) if isinstance(g, list) else str(g))
    )

    # TF-IDF is fine for v1; later we can swap to SBERT/CLIP/etc.
    vec = TfidfVectorizer(max_features=50000, ngram_range=(1, 2))
    X = vec.fit_transform(text)  # sparse [items x vocab]
    # Map: item_id -> dense vector (we’ll keep dense for simplicity; you could keep sparse too)
    # For cosine_similarity across items, dense is convenient for np.savez
    X_dense = X.astype(np.float32).toarray()
    return {iid: X_dense[i] for i, iid in enumerate(df["item_id"].tolist())}

def _tt_from_imdb_int(imdb_int):
    """
    Convert MovieLens imdbId (numeric) to IMDb 'tt' style, zero-padded to 7.
    Example: 1375666 -> 'tt1375666'
    """
    if pd.isna(imdb_int):
        return None
    try:
        s = str(int(imdb_int))
        return f"tt{s.zfill(7)}"
    except Exception:
        return None

def _load_movielens_interactions() -> pd.DataFrame:
    """
    Load implicit positives from MovieLens.
    Supports:
      - CSV style: ratings.csv (+ optional links.csv for IMDb mapping)
      - 100K style: u.data (tab-delimited)
    Returns: DataFrame with columns [userId, item_id] where item_id is:
      - IMDb 'tt...' if links.csv available (CSV style only)
      - else MovieLens movieId as string
    """
    print("Movielens dir " + MOVIELENS_DIR, flush=True)

    ratings_csv = os.path.join(MOVIELENS_DIR, "ratings.csv")
    links_csv   = os.path.join(MOVIELENS_DIR, "links.csv")
    udata_path  = os.path.join(MOVIELENS_DIR, "u.data")

    # ---- Path A: CSV style (ml-20m/25m)
    if os.path.exists(ratings_csv):
        print(f"[load] reading {ratings_csv} ...", flush=True)
        ratings = pd.read_csv(
            ratings_csv,
            usecols=["userId", "movieId", "rating"],
            dtype={"userId": "int32", "movieId": "int32", "rating": "float32"},
            low_memory=False,
        )
        print(f"[load] ratings shape={ratings.shape}", flush=True)

        pos = ratings.loc[ratings["rating"] >= IMPLICIT_THRESHOLD, ["userId", "movieId"]].copy()
        print(f"[filter] positives >= {IMPLICIT_THRESHOLD}: {len(pos):,}", flush=True)

        if os.path.exists(links_csv):
            print(f"[map] reading {links_csv} ...", flush=True)
            links = pd.read_csv(links_csv, usecols=["movieId", "imdbId"])
            links["item_id"] = links["imdbId"].apply(_tt_from_imdb_int)
            pos = pos.merge(links[["movieId", "item_id"]], on="movieId", how="left")
            pos["item_id"] = pos["item_id"].where(pos["item_id"].notna(),
                                                  pos["movieId"].astype(str))
        else:
            print("[map] links.csv not found; using movieId strings", flush=True)
            pos["item_id"] = pos["movieId"].astype(str)

        out = pos[["userId", "item_id"]]
        print(f"[out] interactions rows={len(out):,}", flush=True)
        return out

    # ---- Path B: ML-100K style (u.data)
    if os.path.exists(udata_path):
        print(f"[load] reading {udata_path} (ML-100K) ...", flush=True)
        # u.data columns: user id | item id | rating | timestamp (tab-separated)
        ratings = pd.read_csv(
            udata_path,
            sep="\t",
            header=None,
            names=["userId", "movieId", "rating", "timestamp"],
            dtype={"userId": "int32", "movieId": "int32", "rating": "float32", "timestamp": "int64"},
            engine="python",
        )
        print(f"[load] u.data shape={ratings.shape}", flush=True)

        pos = ratings.loc[ratings["rating"] >= IMPLICIT_THRESHOLD, ["userId", "movieId"]].copy()
        print(f"[filter] positives >= {IMPLICIT_THRESHOLD}: {len(pos):,}", flush=True)

        # ML-100K has no links.csv; use movieId strings as item ids
        pos["item_id"] = pos["movieId"].astype(str)

        out = pos[["userId", "item_id"]]
        print(f"[out] interactions rows={len(out):,}", flush=True)
        return out

    # ---- Neither format found
    raise FileNotFoundError(
        f"No MovieLens files found.\n"
        f"Looked for CSV: {ratings_csv}\n"
        f"and ML-100K: {udata_path}\n"
        f"Set MOVIELENS_DIR correctly and mount the folder into the container."
    )

def _train_cf_itemknn(vectors: Dict[str, np.ndarray]) -> Dict[str, Any]:
    item_ids: List[str] = list(vectors.keys())
    mat = np.stack([vectors[i] for i in item_ids]).astype(np.float32)  # [N x D]
    sims = cosine_similarity(mat)  # [N x N]

    avg_sim = float(np.mean(sims))
    return {
        "item_ids": item_ids,
        "similarity": sims,
        "metrics": {"avg_sim": avg_sim},
    }

 # add at top with other imports

def _train_itemknn_from_interactions(interactions: pd.DataFrame) -> Dict[str, Any]:
    """
    Train item-item cosine KNN from implicit interactions (userId, item_id).
    Keeps only TOP-K neighbors per item using implicit.nearest_neighbours.CosineRecommender.
    """
    # 1) Light tail filters to shrink graph (tune as needed)
    item_cnt = interactions.groupby("item_id").size()
    keep_items = set(item_cnt[item_cnt >= 5].index)    # items with >=5 positives
    user_cnt = interactions.groupby("userId").size()
    keep_users = set(user_cnt[user_cnt >= 5].index)     # users with >=5 positives
    interactions = interactions[interactions["item_id"].isin(keep_items) &
                                interactions["userId"].isin(keep_users)]
    print(f"[train] after min-count filter: users={interactions['userId'].nunique():,} "
          f"items={interactions['item_id'].nunique():,} rows={len(interactions):,}", flush=True)

    # 2) Build CSR
    users = interactions["userId"].astype("category")
    items = interactions["item_id"].astype("category")
    u = users.cat.codes.to_numpy()
    i = items.cat.codes.to_numpy()
    n_users = int(users.cat.categories.size)
    n_items = int(items.cat.categories.size)

    from scipy.sparse import coo_matrix, csr_matrix
    X = coo_matrix((np.ones(len(interactions), dtype=np.float32), (u, i)),
                   shape=(n_users, n_items)).tocsr()
    Xi = X.T.tocsr()  # item × user
    print(f"[train] matrix: users={n_users:,} items={n_items:,} nnz={X.nnz:,}", flush=True)

    # 3) Train item-KNN with cosine; keeps topK internally
    model = implicit.nearest_neighbours.CosineRecommender(K=ITEMKNN_TOPK)
    model.fit(Xi)

    # 4) Extract topK neighbors into CSR (handle both implicit API shapes)
    indptr = [0]; indices = []; data = []

    for item_idx in range(n_items):
        # Ask for K+1 so we can drop the self-neighbor if returned
        res = model.similar_items(item_idx, N=ITEMKNN_TOPK + 1)

        def emit(nbr, score):
            if nbr == item_idx:
                return  # drop self
            indices.append(int(nbr))
            data.append(float(score))

        # Case A: tuple of (indices, scores)
        if isinstance(res, tuple) and len(res) == 2:
            nbrs, scores = res
            for j, s in zip(nbrs, scores):
                emit(j, s)

        # Case B: iterable of (index, score) pairs
        else:
            for j, s in res:
                emit(j, s)

        indptr.append(len(indices))

    from scipy.sparse import csr_matrix
    S = csr_matrix(
        (np.asarray(data, dtype=np.float32),
         np.asarray(indices, dtype=np.int32),
         np.asarray(indptr, dtype=np.int32)),
        shape=(n_items, n_items),
    )

    item_ids = list(items.cat.categories.astype(str))
    avg_sim = float(S.data.mean()) if S.nnz > 0 else 0.0

    return {
        "item_ids": item_ids,
        "similarity_sparse": {
            "data": S.data,
            "indices": S.indices,
            "indptr": S.indptr,
            "shape": S.shape,
        },
        "metrics": {
            "avg_sim": avg_sim,
            "n_items": n_items,
            "n_users": n_users,
            "nnz": int(S.nnz),
        },
    }

def _save_artifacts(model_id: str, version: str, payload: Dict[str, Any]) -> str:
    outdir = _artifact_dir(model_id, version)
    print(f"[save] writing artifacts to: {outdir}", flush=True)
    os.makedirs(outdir, exist_ok=True)

    # Save item ids
    np.savez_compressed(os.path.join(outdir, "item_ids.npz"), item_ids=np.array(payload["item_ids"], dtype=object))

    # Save similarity:
    if "similarity" in payload:
        # dense matrix (content-based)
        np.savez_compressed(os.path.join(outdir, "similarity.npz"), sims=payload["similarity"])
        fmt = "npz_dense"
    elif "similarity_sparse" in payload:
        sp = payload["similarity_sparse"]
        np.save(os.path.join(outdir, "sims_data.npy"),   sp["data"])
        np.save(os.path.join(outdir, "sims_indices.npy"), sp["indices"])
        np.save(os.path.join(outdir, "sims_indptr.npy"),  sp["indptr"])
        with open(os.path.join(outdir, "sims_shape.json"), "w") as f:
            json.dump({"shape": sp["shape"]}, f)
        fmt = "sparse_triplet"
    else:
        raise ValueError("Payload missing similarity entries")

    with open(os.path.join(outdir, "training_metrics.json"), "w") as f:
        json.dump(payload.get("metrics", {}), f, indent=2)

    # Return artifact URI (keep same scheme as base)
    if ARTIFACT_URI_BASE.startswith("file://"):
        return f"{ARTIFACT_URI_BASE}{model_id}/{version}/"
    return f"{ARTIFACT_URI_BASE}{model_id}/{version}/"

def _upsert_registry(conn, model_id: str, version: str, stage: str, artifact_uri: str, metrics: Dict[str, Any], fmt: str):
    sql = """
    insert into model_registry (model_id, version, stage, artifact_uri, format, feature_schema_id, metrics_json, notes)
    values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
    on conflict (model_id, version) do update
      set stage = excluded.stage,
          artifact_uri = excluded.artifact_uri,
          format = excluded.format,
          feature_schema_id = excluded.feature_schema_id,
          metrics_json = excluded.metrics_json,
          notes = excluded.notes
    """
    params = (
        model_id,
        version,
        stage,
        artifact_uri,
        fmt,           # dense or sparse
        "v1",
        json.dumps(metrics),
        "Item-item similarity model",
    )
    with conn.cursor() as cur:
        cur.execute(sql, params)
        conn.commit()

def main():
    parser = argparse.ArgumentParser(description="Train item-item model and register it.")
    parser.add_argument("--model-id", default="cf_itemknn", help="Registry model_id")
    parser.add_argument("--version", required=True, help="Version tag, e.g., 0.0.1")
    parser.add_argument("--stage", default="dev", choices=["dev", "staging", "prod"])
    parser.add_argument("--source", default="movielens", choices=["movielens", "catalog_content"],
                        help="movielens: item-KNN from interactions; catalog_content: TF-IDF content item-KNN")
    args = parser.parse_args()

    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is not set")

    # Connect to DB
    print( f"Connecting to DB at {DATABASE_URL}..." )
    with psycopg.connect(DATABASE_URL) as conn:
        if args.source == "catalog_content":
            # 1) Read catalog
            df = _fetch_catalog(conn)
            if df.empty:
                raise SystemExit("item_catalog is empty — add some movies first")

            # 2) Build content vectors
            vectors = _build_content_vectors(df)

            # 3) Train CF over content vectors (dense)
            result = _train_cf_itemknn(vectors)
            fmt = "npz_dense"

        else:
            # MovieLens interactions path (sparse)
            interactions = _load_movielens_interactions()
            if interactions.empty:
                raise SystemExit("No MovieLens interactions after thresholding.")

            result = _train_itemknn_from_interactions(interactions)
            fmt = "sparse_triplet"

        artifact_uri = _save_artifacts(args.model_id, args.version, result)
        _upsert_registry(conn, args.model_id, args.version, args.stage, artifact_uri, result.get("metrics", {}), fmt)

        print(json.dumps({
            "model_id": args.model_id,
            "version": args.version,
            "stage": args.stage,
            "artifact_uri": artifact_uri,
            "format": fmt,
            "metrics": result.get("metrics", {}),
        }, indent=2))

if __name__ == "__main__":
    main()