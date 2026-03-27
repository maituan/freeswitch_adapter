import { WebSocketServer, WebSocket } from 'ws';
import { AsrClient, ASRResult } from '../app/lib/asrClient';
import 'dotenv/config'; // Load .env file

const PORT = parseInt(process.env.ASR_PROXY_PORT || '8082');

function ts(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

const wss = new WebSocketServer({ port: PORT });

console.log(`${ts()} [ASR Proxy] WebSocket Server started on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log(`${ts()} [ASR Proxy] New client connected`);
  
  let asrClient: AsrClient | null = null;
  let isStreamStarted = false;

  const initAsrClient = () => {
    if (asrClient) return;

    asrClient = new AsrClient();
    
    asrClient.on('data', (result: ASRResult) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'transcript', data: result }));
      }
    });

    asrClient.on('error', (error: Error) => {
      console.error(`${ts()} [ASR Proxy] gRPC Error:`, error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    asrClient.on('end', () => {
      console.log(`${ts()} [ASR Proxy] gRPC Stream ended`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end' }));
      }
    });
  };

  ws.on('message', (message: WebSocket.Data, isBinary: boolean) => {
    try {
      if (isBinary) {
        // Audio chunk — auto-start if no explicit 'start' message was received
        if (!asrClient) initAsrClient();
        if (asrClient && !isStreamStarted) {
          const started = asrClient.startStream();
          isStreamStarted = started;
          if (started) {
            console.log(`${ts()} [ASR Proxy] Auto-started gRPC stream`);
          } else if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'ASR stream not started. Missing ASR_TOKEN?' }));
          }
        }
        if (asrClient && isStreamStarted) {
          const buffer = Buffer.isBuffer(message)
            ? Buffer.from(message)
            : Buffer.from(message as ArrayBuffer);
          asrClient.sendAudio(buffer);
        }
      } else {
        // Control message (JSON)
        const msgStr = message.toString();
        const msg = JSON.parse(msgStr);

        if (msg.type === 'start') {
          console.log(`${ts()} [ASR Proxy] Received START command`);
          initAsrClient();
          if (asrClient) {
            const overrides = {
              speechTimeout: msg.speechTimeout ? String(msg.speechTimeout) : undefined,
              silenceTimeout: msg.silenceTimeout ? String(msg.silenceTimeout) : undefined,
              speechMax: msg.speechMax ? String(msg.speechMax) : undefined,
            };
            const started = asrClient.startStream(overrides);
            isStreamStarted = started;
            if (!started && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'ASR stream not started. Missing ASR_TOKEN?' }));
            }
          }
        } else if (msg.type === 'stop') {
          console.log(`${ts()} [ASR Proxy] Received STOP command`);
          if (asrClient) {
            asrClient.stopStream();
            isStreamStarted = false;
          }
        }
      }
    } catch (error) {
      console.error(`${ts()} [ASR Proxy] Error processing message:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`${ts()} [ASR Proxy] Client disconnected`);
    if (asrClient) {
      asrClient.stopStream();
      asrClient = null;
    }
  });
});

