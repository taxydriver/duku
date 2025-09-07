from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import recs

app = FastAPI(title="Merlin API", version="0.1.0")

# CORS: allow your UI origin(s)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later to your UI origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz():
    return {"ok": True}

app.include_router(recs.router, prefix="/api/v1", tags=["recommendations"])