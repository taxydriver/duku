#!/usr/bin/env bash
set -euo pipefail

MODEL_ID=${MODEL_ID:-cf_itemknn}
VERSION=${VERSION:-0.0.1}
STAGE=${STAGE:-dev}
SOURCE=${SOURCE:-movielens}

echo ">>> Step 1: Build and start merlin-api service..."
docker compose up -d --build merlin-api

echo ">>> Step 2: Run training + register"
docker compose exec merlin-api \
  python -m app.cli.train_and_register \
    --model-id "$MODEL_ID" \
    --version "$VERSION" \
    --stage "$STAGE" \
    --source "$SOURCE"

echo ">>> Step 3: Done. Artifacts should be in ./artifacts and registry updated."