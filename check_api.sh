#!/usr/bin/env bash
set -e

API_BASE="${API_BASE:-http://localhost:8080}"
UI_BASE="${UI_BASE:-http://localhost:3000}"

echo "🔎 Checking merlin-api endpoints..."
echo "API_BASE=${API_BASE}"
echo "UI_BASE=${UI_BASE}"

echo ""
echo "▶ Models (backend direct):"
curl -s "${API_BASE}/api/v1/models" | jq

echo ""
echo "▶ Popular (backend direct):"
curl -s "${API_BASE}/api/v1/movies/popular?k=12" | jq

echo ""
echo "▶ Popular (through Next.js proxy):"
curl -s "${UI_BASE}/api/movies/popular" | jq

echo ""
echo "▶ ALS Recs (cold user, backend direct):"
curl -s -X POST "${API_BASE}/api/v1/recommend" \
  -H "content-type: application/json" \
  -d '{"algo":"mf_als","user_id":"guest-demo","k":5}' | jq

echo ""
echo "▶ CF Recs (seed=Inception, backend direct with session_id):"
curl -s -X POST "${API_BASE}/api/v1/recommend" \
  -H "content-type: application/json" \
  -d '{"algo":"cf_itemknn","seed_item_id":"tt1375666","session_id":"cli-demo","k":5}' | jq

echo ""
echo "▶ CF Recs (seed=Inception, via UI proxy so cookie/session handled):"
curl -s "${UI_BASE}/api/recs?seed_item_id=tt1375666&limit=5" | jq

echo ""
echo "✅ Done"