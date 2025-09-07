# services/merlin-api/app/db/registry.py
from typing import List, Optional, Dict, Any
import os
import psycopg

DATABASE_URL = os.getenv("DATABASE_URL")

def list_models(stage: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch models from the registry (filter by stage if provided)."""
    sql = """
    select model_id, version, stage, artifact_uri, format,
           feature_schema_id, metrics_json, notes
    from model_registry
    """
    params = []
    if stage:
        sql += " where stage = %s"
        params.append(stage)

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()

def get_model(model_id: str, version: Optional[str] = None) -> Optional[Dict[str, Any]]:
    sql = """
    select model_id, version, stage, artifact_uri, format,
           feature_schema_id, metrics_json, notes
    from model_registry
    where model_id = %s
    """
    params = [model_id]
    if version:
        sql += " and version = %s"
        params.append(version)
    else:
        # pick latest (created_at desc)
        sql += " order by created_at desc limit 1"

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchone()