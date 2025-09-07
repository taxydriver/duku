# services/merlin-api/app/trainers/cf_itemknn.py
import os
import json
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from typing import Dict, Any

ARTIFACT_BASE = os.getenv("ARTIFACT_URI_BASE", "./models")

def train_cf_itemknn(items: Dict[str, str], version: str = "0.0.1") -> Dict[str, Any]:
    """
    Train item-item cosine similarity model from content vectors.
    items: dict mapping {item_id: text_embedding_vector}
    """
    item_ids = list(items.keys())
    matrix = np.stack([items[i] for i in item_ids])

    # Compute similarity matrix
    sims = cosine_similarity(matrix)

    # Save artifacts
    outdir = os.path.join(ARTIFACT_BASE, "cf_itemknn", version)
    os.makedirs(outdir, exist_ok=True)

    np.savez_compressed(os.path.join(outdir, "item_ids.npz"), item_ids=item_ids)
    np.savez_compressed(os.path.join(outdir, "similarity.npz"), sims=sims)

    # Save metadata
    meta = {
        "model_id": "cf_itemknn",
        "version": version,
        "format": "npz",
        "feature_schema_id": "v1",
        "metrics_json": {"avg_sim": float(sims.mean())},
        "artifact_uri": outdir,
    }
    with open(os.path.join(outdir, "metadata.json"), "w") as f:
        json.dump(meta, f, indent=2)

    return meta