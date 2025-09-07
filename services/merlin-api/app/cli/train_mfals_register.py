from __future__ import annotations
import argparse, json, os
from typing import Dict, Any, Tuple

import numpy as np
import pandas as pd
import scipy.sparse as sp
import psycopg
import faiss
from implicit.als import AlternatingLeastSquares
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
ARTIFACT_URI_BASE = os.getenv("ARTIFACT_URI_BASE", "file:///models/")

# ---------- helpers ----------

def _artifact_dir(model_id: str, version: str) -> str:
    if ARTIFACT_URI_BASE.startswith("file://"):
        base = ARTIFACT_URI_BASE[len("file://"):]
        return os.path.join(base, model_id, version)
    raise ValueError(f"ARTIFACT_URI_BASE {ARTIFACT_URI_BASE} not supported")

def _fetch_events(conn) -> pd.DataFrame:
    # You can tweak weights below (views get tiny weight, likes/saves bigger)
    sql = """
    select user_id, item_id, event_type
    from events
    where item_id is not null
    """
    df = pd.read_sql(sql, conn)
    if df.empty:
        raise SystemExit("No events found. Insert some interactions first.")
    weight_map = {"view": 0.1, "click": 0.3, "like": 1.0, "save": 1.2}
    df["weight"] = df["event_type"].map(weight_map).fillna(0.1)
    return df[["user_id", "item_id", "weight"]]

def _build_csr(df: pd.DataFrame):
    # Ordered lists of unique users/items
    users = df["user_id"].astype(str).unique().tolist()
    items = df["item_id"].astype(str).unique().tolist()

    # Index dicts
    u2i = {u: i for i, u in enumerate(users)}
    it2i = {it: i for i, it in enumerate(items)}

    # Build sparse matrix
    rows = df["user_id"].astype(str).map(u2i).values
    cols = df["item_id"].astype(str).map(it2i).values
    data = df["weight"].astype(np.float32).values
    mat = sp.csr_matrix((data, (rows, cols)), shape=(len(users), len(items)))

    # Return both lists and dicts
    return mat, users, items, u2i, it2i

def _train_als(csr: sp.csr_matrix, factors=64, reg=0.05, alpha=40.0, iters=20, seed=42):
    # Convert to "confidence" by scaling with alpha (Hu et al.)
    Cui = csr.astype(np.float32) * alpha
    model = AlternatingLeastSquares(
        factors=factors, regularization=reg, iterations=iters, random_state=seed, use_gpu=False
    )
    # implicit expects item-user CSR
    model.fit(Cui.T)
    # Factors
    user_f = np.array(model.user_factors, dtype=np.float32)
    item_f = np.array(model.item_factors, dtype=np.float32)
    return user_f, item_f, {"factors": factors, "reg": reg, "alpha": alpha, "iters": iters}

def _build_faiss_index(item_f: np.ndarray):
    # Inner product ANN. Normalize to use cosine equivalently if you prefer.
    norms = np.linalg.norm(item_f, axis=1, keepdims=True) + 1e-12
    item_f_norm = item_f / norms
    idx = faiss.IndexFlatIP(item_f_norm.shape[1])
    idx.add(item_f_norm.astype(np.float32))
    return idx

def _save_artifacts(
    model_id: str,
    version: str,
    user_f: np.ndarray,
    item_f: np.ndarray,
    users: list[str],
    items: list[str],
    idx: faiss.Index,
) -> str:
    outdir = _artifact_dir(model_id, version)
    os.makedirs(outdir, exist_ok=True)

    # 1) save factors (must align with lists order)
    np.savez_compressed(os.path.join(outdir, "user_factors.npz"), user_factors=user_f)
    np.savez_compressed(os.path.join(outdir, "item_factors.npz"), item_factors=item_f)

    # 2) save mappings aligned to factor rows (position 0..N-1)
    np.savez_compressed(
        os.path.join(outdir, "mappings.npz"),
        user_to_index=np.array(list(zip(users, range(len(users)))), dtype=object),
        item_to_index=np.array(list(zip(items, range(len(items)))), dtype=object),
    )

    # 3) save faiss index
    faiss.write_index(idx, os.path.join(outdir, "items.index"))

    # 4) return artifact uri
    base = ARTIFACT_URI_BASE.rstrip("/")
    return f"{base}/{model_id}/{version}/"

def _upsert_registry(conn, model_id: str, version: str, stage: str, artifact_uri: str, metrics: Dict[str,Any], notes: str):
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
    params = (model_id, version, stage, artifact_uri, "npz+faiss", "v1", json.dumps(metrics), notes)
    with conn.cursor() as cur:
        cur.execute(sql, params)
        conn.commit()

def main():

    print("ALS trainer signature: 2025-09-06T1")
    ap = argparse.ArgumentParser(description="Train ALS (implicit MF) and register in model_registry.")
    ap.add_argument("--model-id", default="mf_als")
    ap.add_argument("--version", required=True)
    ap.add_argument("--stage", default="dev", choices=["dev","staging","prod"])
    ap.add_argument("--factors", type=int, default=64)
    ap.add_argument("--reg", type=float, default=0.05)
    ap.add_argument("--alpha", type=float, default=40.0)
    ap.add_argument("--iters", type=int, default=20)
    args = ap.parse_args()

    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL not set")

    print(f"Connecting to DB at {DATABASE_URL.split('@')[-1]} ...")
    with psycopg.connect(DATABASE_URL) as conn:
        df = _fetch_events(conn)

        # 2) build CSR
        csr, users, items, u2i, it2i = _build_csr(df)

        # 3) train ALS
        user_f, item_f, hp = _train_als(
            csr, factors=args.factors, reg=args.reg, alpha=args.alpha, iters=args.iters
        )

        # --- Resolve factor orientation robustly ---
        rows, cols = csr.shape  # rows == number of users; cols == number of items
        uf_n, if_n = user_f.shape[0], item_f.shape[0]

        # Case A: already aligned with CSR shape
        if (uf_n, if_n) == (rows, cols):
            pass
        # Case B: swapped relative to CSR shape
        elif (uf_n, if_n) == (cols, rows):
            user_f, item_f = item_f, user_f
            uf_n, if_n = user_f.shape[0], item_f.shape[0]
        else:
            # Try alignment against explicit lists as a second signal
            if (uf_n, if_n) == (len(users), len(items)):
                pass
            elif (uf_n, if_n) == (len(items), len(users)):
                user_f, item_f = item_f, user_f
                uf_n, if_n = user_f.shape[0], item_f.shape[0]
            else:
                raise AssertionError(
                    "ALS factor orientation cannot be resolved: "
                    f"user_f={user_f.shape}, item_f={item_f.shape}, "
                    f"csr={csr.shape}, users={len(users)}, items={len(items)}"
                )

        # Final sanity checks (must match CSR and list lengths)
        assert user_f.shape[0] == rows and len(users) == rows, (user_f.shape, rows, len(users))
        assert item_f.shape[0] == cols and len(items) == cols, (item_f.shape, cols, len(items))

        # 4) build FAISS on normalized item factors (cosine/IP)
        idx = _build_faiss_index(item_f)

        # 5) save artifacts (pass users/items, not dicts)
        artifact_uri = _save_artifacts(
            args.model_id, args.version, user_f, item_f, users, items, idx
        )

        # 6) simple metrics
        metrics = {"num_users": int(user_f.shape[0]), "num_items": int(item_f.shape[0]), **hp}

        # 7) registry upsert
        _upsert_registry(
            conn,
            args.model_id,
            args.version,
            args.stage,
            artifact_uri,
            metrics,
            "Implicit ALS factors + FAISS index"
        )

        # Log summary for CLI
        print(json.dumps({
            "model_id": args.model_id,
            "version": args.version,
            "stage": args.stage,
            "artifact_uri": artifact_uri,
            "metrics": metrics
        }, indent=2))

if __name__ == "__main__":
    main()