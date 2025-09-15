# services/merlin-api/app/api/v1/recs.py
from __future__ import annotations
import os
import json
from typing import List, Optional, Tuple, Any, Dict

import psycopg
from psycopg_pool import ConnectionPool
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.serve.itemknn_loader import ItemKNN

def _dsn_with_ssl_keepalives(raw: str) -> str:
    """
    Ensure sslmode=require and TCP keepalives for stability on Render + Supabase.
    Works with both direct (5432) and pooler (6543) URLs.
    """
    dsn = (raw or "").strip()  # <-- trims any stray newline/space
    sep = "&" if "?" in dsn else "?"
    if "sslmode=" not in dsn:
        dsn += f"{sep}sslmode=require"
        sep = "&"
    # Reduce idle disconnects when using the pooler or long-lived connections
    if "keepalives=" not in dsn:
        dsn += f"{sep}keepalives=1&keepalives_idle=30&keepalives_interval=10&keepalives_count=5"
    return dsn



_itemknn = None
def _get_itemknn():
    global _itemknn
    if _itemknn is None:
        _itemknn = ItemKNN(model_id="cf_itemknn", stage="dev")
    return _itemknn

# Optional: import MF ALS recommender loader if present
try:
    from app.serve.mf_loader import recommend_for_user as als_recommend_for_user
except Exception:  # pragma: no cover
    als_recommend_for_user = None  # type: ignore

router = APIRouter()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var not set for merlin-api")

# Build DSN with SSL and keepalives, then create a small global pool
_DSN = _dsn_with_ssl_keepalives(DATABASE_URL)
_pool = ConnectionPool(
    _DSN,
    min_size=1,
    max_size=2,          # keep this low; Supabase pooler is finite
    timeout=10
    kwargs={"autocommit": True},
)

def _pg_conn():
    """Borrow a pooled connection. Usage:
        with _pg_conn() as conn, conn.cursor() as cur:
            cur.execute(...)
    """
    return _pool.connection()


# ---------- Models ----------
class ScoredItem(BaseModel):
    item_id: str
    score: float
    why: Optional[str] = None


class RecommendRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    seed_item_id: Optional[str] = None
    algo: str = "mf_als"
    k: int = 10


class RecommendResponse(BaseModel):
    model_id: str
    version: str
    items: List[ScoredItem]
    timing_ms: Optional[float] = None
    notes: Optional[str] = None


class RegisterRequest(BaseModel):
    email: str
    name: Optional[str] = None
    locale: Optional[str] = "en-AU"


class RegisterResponse(BaseModel):
    user_id: str


class EventIn(BaseModel):
    item_id: str
    # DB constraint allows: 'view' | 'click' | 'like' | 'save'
    # We encode on/off or numeric ratings inside `context`, e.g. {"value": 1} or {"value": 0}
    event_type: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    context: Dict[str, Any] = {}  # JSONB payload stored as-is


class PosterItem(BaseModel):
    item_id: str
    title: Optional[str] = None
    year: Optional[int] = None
    poster_url: Optional[str] = None


# ---------- Helpers ----------

def _to01(v) -> int:
    """Return 0 or 1. Accepts 0/1, '0'/'1', booleans. Defaults to 1 if invalid/None."""
    if isinstance(v, bool):
        return 1 if v else 0
    try:
        return 1 if int(v) == 1 else 0
    except Exception:
        return 1

def _get_latest_model(conn, model_id: str) -> Tuple[str, str]:
    """Return (model_id, version) from model_registry for the given model_id."""
    sql = (
        "select model_id, version from public.model_registry "
        "where model_id = %s order by created_at desc nulls last, version desc limit 1"
    )
    with conn.cursor() as cur:
        cur.execute(sql, (model_id,))
        row = cur.fetchone()
        if not row:
            # fall back to given model id with dummy version
            return (model_id, "dev")
        return (row[0], row[1])

def _ensure_item(conn, item_id: str, meta: dict | None = None):
    meta = meta or {}
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.item_catalog (item_id) values (%s) on conflict (item_id) do nothing",
            (item_id,),
        )
       
# ---------- Routes ----------

@router.post("/recommend", response_model=RecommendResponse)
async def recommend(req: RecommendRequest):
    """Unified recommendation endpoint used by the UI."""
    with _pg_conn() as conn:
        # pick a model entry so response includes id/version
        target_model_id = "mf_als" if req.algo.lower().startswith("mf") else "cf_itemknn"
        model_id, version = _get_latest_model(conn, target_model_id)

    # ALS path (personalized recommendations)
    if req.algo.lower() == "cf_itemknn":
        if not req.seed_item_id:
            # you can decide to return empty or popular when no seed is provided
            return RecommendResponse(model_id="cf_itemknn", version="0.0.1", items=[], notes="seed required")
        knn = _get_itemknn()
        pairs = knn.similar_items(req.seed_item_id, k=req.k)
        items = [ScoredItem(item_id=iid, score=score, why="item-knn") for iid, score in pairs]
        return RecommendResponse(model_id="cf_itemknn", version="0.0.1", items=items, notes="cf_itemknn")

    # Simple content-based / fallback demo: if a seed is given, echo top-k similar would go here.
    # For now, return an empty list to avoid incorrect assumptions.
    return RecommendResponse(model_id=model_id, version=version, items=[], notes=req.algo)


@router.post("/users/register", response_model=RegisterResponse)
async def register_user(req: RegisterRequest):
    """Lightweight registration: upsert by email, return internal user_id."""
    sql_sel = "select user_id from public.users where email = %s limit 1"
    # user_id has DEFAULT gen_random_uuid(); don't supply it explicitly
    sql_ins = (
        "insert into public.users (email, locale, name) "
        "values (%s, %s, %s) returning user_id"
    )
    with _pg_conn() as conn, conn.cursor() as cur:
        cur.execute(sql_sel, (req.email,))
        row = cur.fetchone()
        if row:
            return RegisterResponse(user_id=str(row[0]))
        cur.execute(sql_ins, (req.email, req.locale, req.name))
        new_id = cur.fetchone()[0]
        return RegisterResponse(user_id=str(new_id))


@router.post("/events")
async def record_event(ev: EventIn):
    """Record a single interaction. Stores optional JSONB context."""
    if not ev.item_id or not ev.event_type:
        raise HTTPException(status_code=400, detail="item_id and event_type are required")

    # Debug: show inbound payload (useful while you’re tracing)
    print("[MERLIN] /events inbound", ev.dict(), flush=True)

    # Prepare context: preserve raw and add normalized value for 'like'
    raw_ctx = ev.context or {}
    # Extract raw value if present
    raw_value = None
    if isinstance(raw_ctx, dict) and "value" in raw_ctx:
        raw_value = raw_ctx.get("value")
    elif not isinstance(raw_ctx, dict):
        # If a primitive was sent as the entire context, treat it as the raw value
        raw_value = raw_ctx

    normalized_ctx: Dict[str, Any] = {}
    if ev.event_type == "like":
        # Always store a stable numeric toggle for app logic
        normalized_ctx["value"] = _to01(raw_value)
        # Preserve exactly what the client sent for future ML / analysis
        if raw_value is not None:
            normalized_ctx["value_raw"] = raw_value

    # Pass through a few optional fields if provided by client
    if isinstance(raw_ctx, dict):
        for k in ("meta", "client", "event_schema_version"):
            if k in raw_ctx and k not in normalized_ctx:
                normalized_ctx[k] = raw_ctx[k]
    normalized_ctx.setdefault("event_schema_version", 1)

    # Insert including context as JSONB; ts uses DEFAULT now()
    sql = """
        insert into public.events (user_id, session_id, item_id, event_type, context)
        values (%s, %s, %s, %s, %s::jsonb)
    """

    with _pg_conn() as conn:
        # Ensure the item exists to satisfy the FK (optionally using meta if your catalog supports it)
        meta = raw_ctx.get("meta") if isinstance(raw_ctx, dict) else None
        _ensure_item(conn, ev.item_id, meta)
        with conn.cursor() as cur:
            cur.execute(sql, (ev.user_id, ev.session_id, ev.item_id, ev.event_type, json.dumps(normalized_ctx)))

    print("[MERLIN] /events inserted", {
        "item_id": ev.item_id,
        "event_type": ev.event_type,
        "context": normalized_ctx
    }, flush=True)

    return {"ok": True}


class UserRating(BaseModel):
    item_id: str
    value: int  # 0/1 from like toggle (legacy rows default to 1)


@router.get("/user/ratings", response_model=List[UserRating])
async def get_user_ratings(
    user_id: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
):
    """
    Return the latest like-state per item for a user (or session) from public.events.
    We store toggle state in events.context->>'value':
      - 1 = liked (on)
      - 0 = unliked (off)
    Old rows without context default to 1.
    """
    if not user_id and not session_id:
        raise HTTPException(status_code=400, detail="Provide user_id or session_id")

    where = "user_id = %s" if user_id else "session_id = %s"
    who = user_id or session_id

    # Latest 'like' event per item for this identity.
    # Derive numeric value from context->>'value', defaulting to 1 for legacy rows.
    sql = f"""
        WITH ranked AS (
            SELECT
                item_id,
                COALESCE( (context->>'value')::int, 1 ) AS value,
                ts,
                ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY ts DESC) AS rn
            FROM public.events
            WHERE {where}
              AND event_type = 'like'
        )
        SELECT item_id, value
        FROM ranked
        WHERE rn = 1
        ORDER BY ts DESC
        LIMIT %s
    """

    out: List[UserRating] = []
    with _pg_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (who, limit))
        for item_id, value in cur.fetchall():
            out.append(UserRating(item_id=item_id, value=int(value)))
    return out


@router.get("/movies/popular")
async def movies_popular(k: int = Query(default=20, ge=1, le=200)):
    """Return a simple popular list based on recent events; fallback to a seed list."""
    sql = (
        "select item_id, count(*) as c from public.events "
        "group by item_id order by c desc limit %s"
    )
    items: List[dict] = []
    with _pg_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (k,))
        rows = cur.fetchall()
        items = [{"item_id": r[0]} for r in rows]

    if not items:
        # Fallback to a few well-known IMDb ids
        seed = [
            "tt1375666",  # Inception
            "tt0133093",  # The Matrix
            "tt0111161",  # Shawshank
            "tt0120737",  # LOTR:FOTR
            "tt0468569",  # The Dark Knight
            "tt0816692",  # Interstellar
            "tt0103064",  # Terminator 2
            "tt0088763",  # Back to the Future
            "tt2395427",  # Avengers: Age of Ultron
            "tt4154796",  # Avengers: Endgame
        ][:k]
        items = [{"item_id": x} for x in seed]

    return {"items": items}