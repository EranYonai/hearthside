#!/bin/sh
# Build and start the stack with the app version and commit baked into the images.
set -eu
cd "$(dirname "$0")/.."
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then GIT_SHA="$GIT_SHA-dirty"; fi
export GIT_SHA
exec docker compose up -d --build "$@"
