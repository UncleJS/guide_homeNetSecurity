#!/usr/bin/env bash
set -euo pipefail

# NetInventory — restart the production pod in dependency order (mariadb -> api -> web).
PROJECT_NAME="netinventory"

echo "==> Stopping dev container (dev and prod share pod ports — never run both)"
systemctl --user stop "${PROJECT_NAME}-dev.service" 2>/dev/null || true

echo "==> Restarting services"
systemctl --user reset-failed "${PROJECT_NAME}-api.service" 2>/dev/null || true
systemctl --user restart "${PROJECT_NAME}-mariadb.service"
systemctl --user restart "${PROJECT_NAME}-api.service"
systemctl --user restart "${PROJECT_NAME}-web.service"

echo "Done. Web: http://localhost:11290  API/docs: http://localhost:11291/docs"
