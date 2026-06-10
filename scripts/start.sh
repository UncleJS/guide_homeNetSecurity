#!/usr/bin/env bash
set -euo pipefail

# NetInventory — start the production pod (mariadb -> api -> web).
# Dev and prod share the pod ports (11290/11291), so the dev container is stopped first.
PROJECT_NAME="netinventory"

echo "==> Stopping dev container (dev and prod share pod ports — never run both)"
systemctl --user stop "${PROJECT_NAME}-dev.service" 2>/dev/null || true

echo "==> Starting services"
systemctl --user reset-failed "${PROJECT_NAME}-api.service" 2>/dev/null || true
systemctl --user start "${PROJECT_NAME}-mariadb.service"
systemctl --user start "${PROJECT_NAME}-api.service"
systemctl --user start "${PROJECT_NAME}-web.service"

echo "Done. Web: http://localhost:11290  API/docs: http://localhost:11291/docs"
