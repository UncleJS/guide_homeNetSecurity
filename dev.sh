#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="netinventory"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# Guard 1: repo-local .env must exist
if [[ ! -f .env ]]; then
  echo "ERROR: Missing repo-local .env — run: cp .env.example .env"
  exit 1
fi

# Guard 2: stale host-level env file must not exist
STALE_ENV="${HOME}/.config/containers/systemd/${PROJECT_NAME}.env"
if [[ -f "${STALE_ENV}" ]]; then
  echo "ERROR: Stale host env file detected: ${STALE_ENV}"
  echo "Remove it: rm \"${STALE_ENV}\""
  exit 1
fi

podman build -f Containerfile.dev -t "${PROJECT_NAME}-dev:latest" .
systemctl --user restart "${PROJECT_NAME}-dev" 2>/dev/null || \
  echo "Dev unit not installed yet — run ./install.sh first."
echo "Dev container image rebuilt."
