import os, json, numpy as np
from typing import List, Tuple, Dict
from scipy.sparse import csr_matrix
import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]

def _latest_row(model_id: str, stage: str = "dev") -> Dict:
    sql = """
      select model_id, version, artifact_uri, format
      from public.model_registry
      where model_id = %s and stage = %s
      order by created_at desc limit 1
    """
    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
      cur.execute(sql, (model_id, stage))
      row = cur.fetchone()
      if not row:
        raise RuntimeError(f"model {model_id} (stage={stage}) not found")
      return {"model_id": row[0], "version": row[1], "artifact_uri": row[2], "format": row[3]}

def _from_file_uri(uri: str) -> str:
    if not uri.startswith("file://"):
        raise ValueError(f"only file:// supported, got {uri}")
    return uri[len("file://"):]

class ItemKNN:
    def __init__(self, model_id: str = "cf_itemknn", stage: str = "dev"):
        row = _latest_row(model_id, stage)
        base = _from_file_uri(row["artifact_uri"]).rstrip("/")
        # load ids
        ids = np.load(os.path.join(base, "item_ids.npz"), allow_pickle=True)["item_ids"].tolist()
        self.item_ids: List[str] = [str(x) for x in ids]
        self.index: Dict[str, int] = {iid: i for i, iid in enumerate(self.item_ids)}
        # load sparse csr
        data   = np.load(os.path.join(base, "sims_data.npy"))
        indices= np.load(os.path.join(base, "sims_indices.npy"))
        indptr = np.load(os.path.join(base, "sims_indptr.npy"))
        with open(os.path.join(base, "sims_shape.json")) as f:
            shape = tuple(json.load(f)["shape"])
        self.S = csr_matrix((data, indices, indptr), shape=shape)

    def similar_items(self, seed_item_id: str, k: int = 10) -> List[Tuple[str, float]]:
        i = self.index.get(str(seed_item_id))
        if i is None:  # unknown seed
            return []
        row = self.S.getrow(i)
        if row.nnz == 0:
            return []
        # sort by score, high→low
        order = row.data.argsort()[::-1]
        top_idx = row.indices[order][:k]
        top_val = row.data[order][:k]
        return [(self.item_ids[j], float(s)) for j, s in zip(top_idx, top_val)]