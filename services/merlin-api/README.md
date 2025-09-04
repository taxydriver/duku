
# Merlin API (Mock)

FastAPI service that mocks the endpoints Duku UI needs.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

## Endpoints
- `GET /movies/popular`
- `GET /movies/search?q=...`
- `POST /ratings` (JSON: `{ userId?, movieId, value }`)
- `GET /recs?userId=&algo=&ser=&explore=&novel=&limit=`


## Data setup (Merlin API)

Download MovieLens 25M from [grouplens.org](https://grouplens.org/datasets/movielens/25m/).

Place at least these files into `services/merlin-api/app/data/`:

- `movies.csv`
- `links.csv`
- (optional) `ratings.csv`

These files are **not included** in git; you must download them yourself.