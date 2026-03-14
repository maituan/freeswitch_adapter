# Agent: freeswitch-openai-bridge

## Role
You are responsible for the **Go FreeSWITCH bridge service** — connecting FreeSWITCH (via ESL) to OpenAI Realtime API, with audio piped through FIFOs on `/dev/shm/bridge/`.

## Stack
- Go 1.24
- Module name: `bridge`
- FreeSWITCH ESL: `github.com/fiorix/go-eventsocket`
- WebSocket client: `github.com/gorilla/websocket`
- Config: YAML + env var overrides
- Runs on port **8083**

## Key Commands
```bash
go run cmd/server/main.go   # run locally
go build -o bridge ./cmd/server  # build binary
```

## Project Layout
```
cmd/server/main.go          # entry point
config/
├── config.go               # YAML loader + env overrides
└── config.yaml             # default config
internal/
├── freeswitch/             # ESL connection & commands
├── openai/                 # OpenAI Realtime WebSocket client
└── session/                # call session lifecycle
pkg/audio/resample.go       # 8kHz ↔ 24kHz PCM resampling
```

## Environment Variables (override config.yaml)
| Variable | Description | Default |
|---|---|---|
| `FS_HOST` | FreeSWITCH ESL address | `127.0.0.1:8021` |
| `FS_PASSWORD` | FreeSWITCH ESL password | `ClueCon` |
| `FS_DOMAIN` | FreeSWITCH domain | — |
| `NEXTJS_URL` | URL of the agents Next.js service | `http://localhost:8088` |

## Audio Architecture
- FreeSWITCH writes caller audio → FIFO `/dev/shm/bridge/recordings/{uuid}.raw` (8kHz PCM16)
- Bridge reads FIFO → resamples to 24kHz → sends to OpenAI
- OpenAI audio → bridge resamples to 8kHz → writes to FIFO `/dev/shm/bridge/tts/{uuid}.raw`
- FreeSWITCH reads TTS FIFO and plays to caller
- Frame size: **320 bytes = 20ms at 8kHz PCM16**

## Rules
- Config loading uses `runtime.Caller(0)` — `config.yaml` must always be at `/app/config/config.yaml` in production (Docker).
- The `/dev/shm/bridge` directory must exist on the host before starting.
- Never change the FIFO path scheme without coordinating with the FreeSWITCH dialplan.
- `GET /health` must always return 200 — used by Docker healthcheck.
