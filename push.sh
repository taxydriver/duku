#!/bin/bash
# Usage: ./git-commit-push.sh "your commit message"

# Exit if no commit message provided
if [ -z "$1" ]; then
  echo "❌ Please provide a commit message."
  echo "Usage: $0 \"your commit message\""
  exit 1
fi

# Capture commit message
MSG="$1"

# Add all changes
git add -A

# Commit
git commit -m "$MSG"

# Push to the current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$BRANCH"

echo "✅ Changes committed and pushed to branch: $BRANCH"