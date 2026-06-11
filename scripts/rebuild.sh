#!/usr/bin/env bash
set -euo pipefail

# NetInventory — rebuild production images from source and restart the services so the
# new images take effect. Quadlet recreates each container from localhost/<img>:latest
# on restart. The database volume is untouched.
#
# Usage:
#   scripts/rebuild.sh            # rebuild api + web images, restart api + web
#   scripts/rebuild.sh --dev      # also rebuild the dev image (does not restart prod dev)
#   scripts/rebuild.sh --no-restart  # build images only, do not restart services
PROJECT_NAME="netinventory"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

BUILD_DEV=0
RESTART=1
for arg in "$@"; do
  case "$arg" in
    --dev)        BUILD_DEV=1 ;;
    --no-restart) RESTART=0 ;;
    *) echo "Unknown option: $arg" ; echo "Valid: --dev, --no-restart" ; exit 2 ;;
  esac
done

if [[ ! -f .env ]]; then
  echo "ERROR: Missing repo-local .env — run: cp .env.example .env"
  exit 1
fi

echo "==> Rebuilding production images"
podman build -f containers/Containerfile.api -t "localhost/${PROJECT_NAME}-api:latest" .
podman build -f containers/Containerfile.web -t "localhost/${PROJECT_NAME}-web:latest" .

if [[ "$BUILD_DEV" == "1" ]]; then
  echo "==> Rebuilding dev image"
  podman build -f containers/Containerfile.dev -t "${PROJECT_NAME}-dev:latest" .
fi

if [[ "$RESTART" == "1" ]]; then
  echo "==> Restarting services to pick up new images"
  systemctl --user reset-failed "${PROJECT_NAME}-api.service" 2>/dev/null || true
  systemctl --user restart "${PROJECT_NAME}-api.service"
  systemctl --user restart "${PROJECT_NAME}-web.service"
  echo "Done. Web: http://localhost:11290  API/docs: http://localhost:11291/docs"
else
  echo "Images rebuilt. Skipped restart (--no-restart)."
fi
