#!/usr/bin/env bash
set -euo pipefail

# NetInventory — project-scoped FULL teardown (rootless Podman). NEVER prunes.
# Removes this project's units, containers, images, and Quadlet files.
# Pass --purge-volumes to ALSO delete the database volume (DESTRUCTIVE, irreversible).
#
# Usage:
#   scripts/teardown.sh                  # remove units/containers/images, KEEP data
#   scripts/teardown.sh --purge-volumes  # also delete the MariaDB named volume
PURGE=0
[[ "${1:-}" == "--purge-volumes" ]] && PURGE=1

QUADLET_DST="${HOME}/.config/containers/systemd"

PROJECT_UNITS=(
  netinventory-web.service
  netinventory-api.service
  netinventory-dev.service
  netinventory-mariadb.service
  netinventory-pod-pod.service
)
PROJECT_POD="netinventory"
PROJECT_CONTAINERS=(netinventory-web netinventory-api netinventory-dev netinventory-mariadb)
PROJECT_IMAGES=(localhost/netinventory-api:latest localhost/netinventory-web:latest localhost/netinventory-dev:latest netinventory-dev:latest)
# List both Quadlet and systemd- prefixed variants.
PROJECT_VOLUMES=(netinventory-db netinventory-dev systemd-netinventory-db systemd-netinventory-dev)

echo "==> Stopping units"
for u in "${PROJECT_UNITS[@]}"; do systemctl --user stop "$u" >/dev/null 2>&1 || true; done
echo "==> Disabling units"
for u in "${PROJECT_UNITS[@]}"; do
  systemctl --user disable "$u" >/dev/null 2>&1 || true
  systemctl --user reset-failed "$u" >/dev/null 2>&1 || true
done

echo "==> Removing runtime"
podman pod rm -f "$PROJECT_POD" >/dev/null 2>&1 || true
for c in "${PROJECT_CONTAINERS[@]}"; do podman rm -f "$c" >/dev/null 2>&1 || true; done
for i in "${PROJECT_IMAGES[@]}"; do podman image rm -f "$i" >/dev/null 2>&1 || true; done

echo "==> Removing unit files"
rm -f "${QUADLET_DST}"/netinventory-*.pod "${QUADLET_DST}"/netinventory-*.volume "${QUADLET_DST}"/netinventory-*.container
systemctl --user daemon-reload

if [[ "$PURGE" == "1" ]]; then
  echo "==> Purging named volumes (DESTRUCTIVE)"
  for v in "${PROJECT_VOLUMES[@]}"; do podman volume rm -f "$v" >/dev/null 2>&1 || true; done
else
  echo "Volumes kept. Re-run with --purge-volumes to delete the database."
fi
echo "Done."
