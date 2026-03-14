# FLow
1. Call Answer
   ↓
2. TTS WebSocket:
   - Connect & Auth
   - Send welcome text
   - Receive PCM audio chunks (base64)
   - Play audio qua FreeSWITCH
   ↓
3. STT gRPC Streaming:
   - Open stream with metadata
   - Record audio từ FreeSWITCH
   - Stream audio chunks (2000 bytes)
   - Receive results (transcript, final)
   ↓
4. OpenAI Processing:
   - Send conversation history
   - Get response with context
   ↓
5. TTS Response:
   - Send AI response text
   - Play audio
   ↓
6. Loop back to step 3
# Setup
1. Cài go 
```
wget https://go.dev/dl/go1.22.5.linux-amd64.tar.gz

sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz

nano ~/.bashrc
export PATH=$PATH:/usr/local/go/bin
export GOPATH=$HOME/go
export PATH=$PATH:$GOPATH/bin
export PATH=$PATH:$(go env GOPATH)/bin

source ~/.bashrc
```
2. Cài dependencies
go get github.com/gorilla/websocket
go get google.golang.org/grpc
go get google.golang.org/protobuf
go get github.com/fiorix/go-eventsocket/eventsocket
go get gopkg.in/yaml.v3

3. Generate STT proto
Plugin go
sudo apt install -y protobuf-compiler

go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

protoc --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  proto/streaming_voice/streaming_voice.proto

# Run nhanh
go mod tidy
go run cmd/server/main.go -config config/config.yaml

# deploy

1. Build
go build -v -o bin/voicebot cmd/server/main.go

2. Copy 
bin/voicebot , config/config.yaml -> /opt/voicebot/

chmod +x /opt/voicebot/bin/voicebot

3. Create file 
/etc/systemd/system/voicebot.service

```
[Unit]
Description=Example systemd service.
After=network.target freeswitch.service

[Service]
Type=simple
Restart=always

WorkingDirectory=/opt/voicebot
ExecStart=/opt/voicebot/bin/voicebot -config /opt/voicebot/config/config.yaml

LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```
sudo systemctl daemon-reload
sudo systemctl enable voicebot
sudo systemctl start voicebot

# server
```
sudo systemctl stop voicebot
sudo cp -r voicebot /opt/voicebot/bin/
sudo cp -r config.yaml /opt/voicebot/config/
sudo systemctl start voicebot
journalctl -u voicebot.service -f
```

sudo nano /opt/voicebot/config/config.yaml