#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
for tool in node npm python3; do
  command -v "$tool" >/dev/null || { echo "Missing required command: $tool" >&2; exit 1; }
done
case "${1:-}" in
  install|build)
    if [[ "${1}" == install ]]; then
      (cd backend && npm ci)
      (cd frontend && npm ci)
    fi
    (cd backend && npm run build)
    (cd frontend && npm run build)
    echo 'Build complete. Run: bash setup-linux.sh start'
    ;;
  start)
    [[ -f backend/dist/index.js && -f frontend/.next/BUILD_ID ]] || { echo 'Run bash setup-linux.sh install first.' >&2; exit 1; }
    for port in 3001 3002; do
      if command -v ss >/dev/null && ss -H -ltn "sport = :$port" | grep -q .; then
        echo "Port $port is already in use. Stop the existing dashboard first." >&2; exit 1
      fi
    done
    # Separate sessions let cleanup terminate Node plus its Python sensor child.
    command -v setsid >/dev/null || { echo 'setsid is required (util-linux).' >&2; exit 1; }
    back_pid=''; front_pid=''
    cleanup() {
      trap - EXIT INT TERM
      [[ -z "$back_pid" ]] || kill -- "-$back_pid" 2>/dev/null || true
      [[ -z "$front_pid" ]] || kill -- "-$front_pid" 2>/dev/null || true
      wait 2>/dev/null || true
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    (cd backend && exec setsid node dist/index.js) & back_pid=$!
    (cd frontend && exec setsid node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3002) & front_pid=$!
    echo 'Dashboard: http://127.0.0.1:3002 — Ctrl+C stops both servers.'
    wait -n "$back_pid" "$front_pid"
    ;;
  *) echo 'Usage: bash setup-linux.sh {install|build|start}'; exit 1 ;;
esac
