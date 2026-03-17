#!/bin/bash

PORT=8085
ASR_PROXY_PORT=8084

kill_port_if_busy() {
  local target_port="$1"
  local pids

  echo "Đang kiểm tra tiến trình cũ trên port ${target_port}..."
  pids=$(lsof -ti :"${target_port}")
  if [ -z "${pids}" ]; then
    return
  fi

  echo "Đang dừng tiến trình cũ trên port ${target_port}: ${pids}"
  kill ${pids} 2>/dev/null || true
  sleep 1

  # Nếu vẫn còn, force kill để đảm bảo start lại sạch
  pids=$(lsof -ti :"${target_port}")
  if [ -n "${pids}" ]; then
    echo "Tiến trình vẫn còn trên port ${target_port}, force kill: ${pids}"
    kill -9 ${pids} 2>/dev/null || true
  fi
}

kill_port_if_busy "${PORT}"
kill_port_if_busy "${ASR_PROXY_PORT}"

echo "Đang khởi động project trên port ${PORT}..."
export PORT
nohup npm run dev > app.log 2>&1 &

echo "Project đã được chạy ngầm (background)!"
echo "Bạn có thể xem log bằng lệnh: tail -f app.log"
echo "Để dừng project, hãy kill theo port: ${PORT} (web) và ${ASR_PROXY_PORT} (asr-proxy)"
