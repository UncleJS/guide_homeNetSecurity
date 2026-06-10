#!/usr/bin/env bash
set -euo pipefail

# NetInventory — stop the production pod (web -> api -> mariadb). Volumes and images
# are left intact; this only stops the running containers. Use teardown.sh to remove.
PROJECT_NAME="netinventory"

echo "==> Stopping services"
systemctl --user stop "${PROJECT_NAME}-web.service"    2>/dev/null || true
systemctl --user stop "${PROJECT_NAME}-api.service"    2>/dev/null || true
systemctl --user stop "${PROJECT_NAME}-mariadb.service" 2>/dev/null || true
# Stop the pod infra container too, so the pod is fully down.
systemctl --user stop "${PROJECT_NAME}-pod-pod.service" 2>/dev/null || true

echo "Stopped. Data volume is preserved. Run scripts/start.sh to bring it back up."
