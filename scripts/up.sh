#!/bin/sh
# Build and start the stack with the app version and commit baked into the images.
set -eu
cd "$(dirname "$0")/.."
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then GIT_SHA="$GIT_SHA-dirty"; fi
export GIT_SHA
mkdir -p secrets
if [ ! -f secrets/encryption_key.txt ]; then
  (umask 077 && openssl rand -base64 32 > secrets/encryption_key.txt)
  echo "Created secrets/encryption_key.txt. Back it up offline: without it the data can't be read." >&2
fi
exec docker compose up -d --build "$@"
