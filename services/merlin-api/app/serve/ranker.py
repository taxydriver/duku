# services/merlin-api/app/serve/ranker.py
from typing import List, Dict

def rerank(candidates: List[Dict], model_id: str, version: str, k: int = 20) -> List[Dict]:
    """
    Ranker stub.
    TODO: load ONNX/TorchScript model and rerank candidates.
    """
    ranked = sorted(candidates, key=lambda x: x["score"], reverse=True)
    return ranked[:k]