# services/merlin-api/app/main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import recs

app = FastAPI(title="Merlin API", version="0.1.0")

# Get frontend origin(s) from environment
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
origins = [frontend_origin]

# If you ever need to support multiple domains, split by comma:
# FRONTEND_ORIGIN="https://duku-ui.onrender.com,https://www.mycustomdomain.com"
if "," in frontend_origin:
    origins = [o.strip() for o in frontend_origin.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/healthz")
def healthz():
    return {"ok": True}

# API routes
app.include_router(recs.router, prefix="/api/v1", tags=["recommendations"])