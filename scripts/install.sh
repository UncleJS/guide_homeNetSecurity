#!/usr/bin/env bash
set -euo pipefail

# NetInventory — build production images and install Quadlet units (rootless Podman).
PROJECT_NAME="netinventory"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUADLET_DST="${HOME}/.config/containers/systemd"
cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: Missing repo-local .env — run: cp .env.example .env"
  exit 1
fi

echo "==> Building production images"
podman build -f containers/Containerfile.api -t "localhost/${PROJECT_NAME}-api:latest" .
podman build -f containers/Containerfile.web -t "localhost/${PROJECT_NAME}-web:latest" .
podman build -f containers/Containerfile.dev -t "${PROJECT_NAME}-dev:latest" .

echo "==> Installing PROD Quadlet units to ${QUADLET_DST}"
# Deploy only prod units. The dev container shares the pod's ports (11290/11291),
# and a Quadlet .pod auto-starts every member container — so installing the dev
# unit here would make it collide with the prod web/api. Run dev separately.
mkdir -p "${QUADLET_DST}"
cp .quadlet/netinventory-pod.pod \
   .quadlet/netinventory-db.volume \
   .quadlet/netinventory-mariadb.container \
   .quadlet/netinventory-api.container \
   .quadlet/netinventory-web.container \
   "${QUADLET_DST}/"
# Remove any stale dev unit from a previous install so the pod won't pull it in.
rm -f "${QUADLET_DST}/netinventory-dev.container" "${QUADLET_DST}/netinventory-dev.volume"

echo "==> Reloading systemd (user)"
systemctl --user daemon-reload

echo "==> Stopping dev container (dev and prod share pod ports — never run both)"
systemctl --user stop netinventory-dev.service 2>/dev/null || true

echo "==> Starting services"
systemctl --user reset-failed netinventory-api.service 2>/dev/null || true
systemctl --user start netinventory-mariadb.service
systemctl --user start netinventory-api.service
systemctl --user start netinventory-web.service

echo "Done. Web: http://localhost:11290  API/docs: http://localhost:11291/docs"
