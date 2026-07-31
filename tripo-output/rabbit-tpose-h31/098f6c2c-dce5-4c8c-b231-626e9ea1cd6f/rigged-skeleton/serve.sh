#!/usr/bin/env bash
# Serve this demo folder (required for ES modules + GLB).
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-5188}"
echo "Rabbit rig demo → http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
