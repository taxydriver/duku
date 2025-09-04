# Duku – movie discovery through play

## Apps
- `apps/duku-ui` – Next.js + Tailwind (App Router)
- `services/merlin-api` – FastAPI (MovieLens 25M + TMDB)

## Dev
```bash
# UI
cd apps/duku-ui
cp .env.example .env.local   # set TMDB_API_KEY
npm i
npm run dev

# API
cd services/merlin-api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080