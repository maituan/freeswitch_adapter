#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

mkdir -p logs

SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
  if sudo -n true >/dev/null 2>&1; then
    SUDO="sudo -n"
  fi
fi

get_listening_pids() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -ti :"$port" 2>/dev/null || true
    return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    $SUDO ss -ltnp "sport = :$port" 2>/dev/null \
      | awk -F'pid=' '{for (i=2; i<=NF; i++) {split($i, a, ","); print a[1]}}' \
      | awk 'NF' \
      | sort -u
    return 0
  fi

  echo "ERROR: neither lsof nor ss is available to inspect ports." >&2
  return 1
}

kill_port_if_used() {
  local port="$1"
  local pids attempt

  # Retry loop in case supervisor auto-restarts briefly.
  for attempt in 1 2 3; do
    pids="$(get_listening_pids "$port" || true)"
    if [[ -z "$pids" ]]; then
      return 0
    fi
    echo "Port $port in use (attempt $attempt), killing PID(s): $pids"
    $SUDO kill $pids >/dev/null 2>&1 || true
    sleep 1
    pids="$(get_listening_pids "$port" || true)"
    if [[ -n "$pids" ]]; then
      $SUDO kill -9 $pids >/dev/null 2>&1 || true
      sleep 1
    fi
  done
}

assert_port_free() {
  local port="$1"
  local pids
  pids="$(get_listening_pids "$port" || true)"
  if [[ -n "$pids" ]]; then
    echo "ERROR: port $port is still in use by PID(s): $pids"
    if command -v lsof >/dev/null 2>&1; then
      lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
    elif command -v ss >/dev/null 2>&1; then
      $SUDO ss -ltnp "sport = :$port" || true
    fi
    exit 1
  fi
}

kill_port_if_used 8088
kill_port_if_used 8082
assert_port_free 8088
assert_port_free 8082

rm -rf .next
npm run build > logs/build.log 2>&1

nohup env HOST=0.0.0.0 PORT=8088 npm run start > logs/next.log 2>&1 &
NEXT_PID=$!

nohup npm run asr-proxy > logs/asr-proxy.log 2>&1 &
ASR_PID=$!

echo "Started this project in background."
echo "Next.js PID: $NEXT_PID (http://localhost:8088, logs/next.log)"
echo "ASR proxy PID: $ASR_PID (logs/asr-proxy.log)"
echo "Build log: logs/build.log"

