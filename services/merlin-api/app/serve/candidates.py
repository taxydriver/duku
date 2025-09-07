# services/merlin-api/app/serve/candidates.py
from typing import List, Dict

def get_candidates(user_id: str = None, session_id: str = None, k: int = 100) -> List[Dict]:
    """
    Candidate generation stub.
    TODO: implement popularity, CF, content, MF.
    """
    return [{"item_id": f"cand_{i:05d}", "score": 1.0} for i in range(k)]