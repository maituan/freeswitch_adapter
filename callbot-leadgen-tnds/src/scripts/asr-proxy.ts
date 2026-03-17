import { WebSocketServer, WebSocket } from 'ws';
import { AsrClient, ASRResult } from '../app/lib/asrClient';
import 'dotenv/config'; // Load .env file

const PORT = parseInt(process.env.ASR_PROXY_PORT || '8082');

const wss = new WebSocketServer({ port: PORT });

console.log(`[ASR Proxy] WebSocket Server started on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[ASR Proxy] New client connected');
  
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
      console.error('[ASR Proxy] gRPC Error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    asrClient.on('end', () => {
      console.log('[ASR Proxy] gRPC Stream ended');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end' }));
      }
    });
  };

  ws.on('message', (message: WebSocket.Data, isBinary: boolean) => {
    try {
      if (isBinary) {
        // Audio chunk
        // Require explicit START before accepting audio chunks.
        // This avoids duplicate start attempts that can trigger upstream 400 errors.
        if (!asrClient || !isStreamStarted) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: 'ASR stream is not started. Send START first.' }));
          }
          return;
        }

        if (asrClient && isStreamStarted) {
          const buffer = message as Buffer;
          asrClient.sendAudio(buffer);
        }
      } else {
        // Control message (JSON)
        const msgStr = message.toString();
        const msg = JSON.parse(msgStr);

        if (msg.type === 'start') {
          console.log('[ASR Proxy] Received START command');
          if (isStreamStarted) {
            return;
          }
          initAsrClient();
          if (asrClient) {
            const started = asrClient.startStream();
            isStreamStarted = started;
            if (!started && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'ASR stream not started. Verify ASR_TOKEN and ASR_GRPC_URI.' }));
            }
          }
        } else if (msg.type === 'stop') {
          console.log('[ASR Proxy] Received STOP command');
          if (asrClient) {
            asrClient.stopStream();
            isStreamStarted = false;
          }
        }
      }
    } catch (error) {
      console.error('[ASR Proxy] Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('[ASR Proxy] Client disconnected');
    if (asrClient) {
      asrClient.stopStream();
      asrClient = null;
    }
  });
});

