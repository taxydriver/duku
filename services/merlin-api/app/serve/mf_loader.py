from __future__ import annotations
import os
from typing import Dict, Tuple, List, Optional
import numpy as np
import faiss

# Cache: {(model_id, version): (user_f, item_f, u2i, it2i, faiss_index)}
_CACHE: Dict[Tuple[str, str], Tuple[np.ndarray, np.ndarray, Dict[str,int], Dict[str,int], faiss.Index]] = {}

def _path_from_uri(uri: str) -> str:
    if uri.startswith("file://"):
        return uri[len("file://"):]
    raise ValueError(f"Unsupported artifact URI: {uri}")

def load_mf_als(model_id: str, version: str, artifact_uri: str):
    key = (model_id, version)
    if key in _CACHE:
        return _CACHE[key]

    base = _path_from_uri(artifact_uri)
    user_f = np.load(os.path.join(base, "user_factors.npz"))["user_factors"]
    item_f = np.load(os.path.join(base, "item_factors.npz"))["item_factors"]

    mp = np.load(os.path.join(base, "mappings.npz"), allow_pickle=True)
    u_pairs = mp["user_to_index"].tolist()
    i_pairs = mp["item_to_index"].tolist()

    # Dicts
    u2i = {str(k): int(v) for k, v in u_pairs}
    it2i = {str(k): int(v) for k, v in i_pairs}

    # Build a position-indexed list of item_ids where index == FAISS row
    max_idx = max(it2i.values()) if it2i else -1
    inv_items: list[Optional[str]] = [None] * (max_idx + 1)
    for item_id, idx in it2i.items():
        if 0 <= idx <= max_idx:
            inv_items[idx] = str(item_id)

    index = faiss.read_index(os.path.join(base, "items.index"))

    _CACHE[(model_id, version)] = (user_f, item_f, u2i, inv_items, index)
    return _CACHE[(model_id, version)]

def _l2norm(x: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(x) + 1e-12
    return (x / n).astype(np.float32)

def recommend_for_user(user_id: str, k: int, model_id: str, version: str, artifact_uri: str):
    user_f, item_f, u2i, inv_items, index = load_mf_als(model_id, version, artifact_uri)

    if user_id not in u2i:
        return []

    u_idx = u2i[user_id]
    if u_idx < 0 or u_idx >= user_f.shape[0]:
     return []  # let API fall back (trending)
    u_vec = _l2norm(user_f[u_idx])

    D, I = index.search(u_vec[None, :], k)
    out = []
    for score, idx in zip(D[0].tolist(), I[0].tolist()):
        if idx == -1:
            continue
        # Guard against missing/short mapping
        if idx < 0 or idx >= len(inv_items):
            continue
        item_id = inv_items[idx]
        if not item_id:
            continue
        out.append((item_id, float(score)))
    return out