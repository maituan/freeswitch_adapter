#!/usr/bin/env bash
set -euo pipefail

REMOTE="root@113.20.107.51"
REMOTE_DIR="/root/setup-new-2"

rsync -avz --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='*.log' \
  --exclude='.env.local' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  "${REMOTE}:${REMOTE_DIR}/" .

echo "Sync done ← ${REMOTE}:${REMOTE_DIR}"
