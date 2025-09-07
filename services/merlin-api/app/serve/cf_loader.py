# services/merlin-api/app/serve/cf_loader.py
from __future__ import annotations
import os
from typing import Dict, Tuple, List
import numpy as np

# Simple in-process cache: {(model_id, version): (item_ids, sim_matrix)}
_CACHE: Dict[Tuple[str, str], Tuple[List[str], np.ndarray]] = {}

def _path_from_uri(artifact_uri: str) -> str:
    # Supports file:// URIs
    if artifact_uri.startswith("file://"):
        return artifact_uri[len("file://"):]
    raise ValueError(f"Unsupported artifact URI: {artifact_uri}")

def load_cf_itemknn(model_id: str, version: str, artifact_uri: str) -> Tuple[List[str], np.ndarray]:
    key = (model_id, version)
    if key in _CACHE:
        return _CACHE[key]

    base = _path_from_uri(artifact_uri)
    ids_npz = os.path.join(base, "item_ids.npz")
    sim_npz = os.path.join(base, "similarity.npz")

    item_ids = np.load(ids_npz, allow_pickle=True)["item_ids"].tolist()
    sims = np.load(sim_npz)["sims"]

    _CACHE[key] = (item_ids, sims)
    return item_ids, sims

def topk_similar(
    item_ids: List[str],
    sims: np.ndarray,
    seed_item_id: str,
    k: int = 20,
    exclude_seed: bool = True,
) -> List[Tuple[str, float]]:
    try:
        idx = item_ids.index(seed_item_id)
    except ValueError:
        return []
    row = sims[idx]
    # argsort descending
    order = np.argsort(-row)
    out = []
    for j in order:
        if exclude_seed and j == idx:
            continue
        out.append((item_ids[j], float(row[j])))
        if len(out) >= k:
            break
    return out