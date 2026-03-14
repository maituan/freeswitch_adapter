import { NextRequest } from "next/server";
import { generateTTSAudio, getTtsWebsocketUri, testTTSConnection } from "@/app/lib/ttsClient";

// We use the Node.js runtime because this route relies on Node Buffer and the `ws` package (via ttsClient).
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voiceId = "phuongnhi-north", resampleRate = 8000, mode: requestedMode = "streaming" } = body;
    // Force streaming mode to avoid offline fetch timeouts.
    const mode = requestedMode === "offline" ? "streaming" : requestedMode;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[TTS API] Generating TTS (${mode}) for text length: ${text.length}`);
    const startTime = Date.now();

    // We only support streaming raw PCM in this app (frontend expects Int16 PCM).
    const outputFormat = "pcm_s16le" as const;

    // Always use streaming (raw PCM) for predictable latency.
    const audioChunks = await generateTTSAudio(text, {
      voiceId,
      resampleRate,
    });
    const totalAudio = Buffer.concat(audioChunks);
    
    console.log(`[TTS API] Generated ${totalAudio.length} bytes in ${Date.now() - startTime}ms`);

    // Return raw PCM. Frontend `useTTS.ts` expects Int16 PCM.
    
    return new Response(totalAudio, {
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Audio-Format": outputFormat,
        "X-Sample-Rate": resampleRate.toString(),
        "X-Channels": "1",
        "X-Bit-Depth": "16",
        "Cache-Control": "no-cache",
        "Content-Length": totalAudio.length.toString(),
      },
    });
  } catch (error) {
    console.error("[TTS API] Error:", error);
    return new Response(
      JSON.stringify({
        error: "TTS generation failed",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Health check endpoint
export async function GET() {
  try {
    const isConnected = await testTTSConnection();
    
    if (isConnected) {
      return new Response(
        JSON.stringify({
          status: "ok",
          message: "TTS service is available",
          websocket_uri: getTtsWebsocketUri(),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Cannot connect to TTS WebSocket service",
          websocket_uri: getTtsWebsocketUri(),
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "TTS health check failed",
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

