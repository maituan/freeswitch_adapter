import WebSocket from 'ws';

// TTS Configuration
export function getTtsWebsocketUri(): string {
  const fallback = "ws://103.253.20.27:8767";
  const env = process.env.TTS_WEBSOCKET_URI;
  if (!env) return fallback;

  try {
    const u = new URL(env);
    // Force port 8767 for this host to avoid misconfig (8767).
    if (u.hostname === '103.253.20.27' && u.port === '8767') {
      u.port = '8767';
      return u.toString();
    }
    return env;
  } catch {
    // Best-effort string rewrite if URL parsing fails
    const rewritten = env.replace(/103\.253\.20\.27:8767\b/g, '103.253.20.27:8767');
    return rewritten || fallback;
  }
}

const TTS_WEBSOCKET_URI = getTtsWebsocketUri();
const ELEVEN_LABS_VOICE_STABILITY = '0.5';
const ELEVEN_LABS_VOICE_SIMILARITY_BOOST = '0.7';
const TTS_TEMPO = process.env.TTS_TEMPO ? parseFloat(process.env.TTS_TEMPO) : undefined;

export interface TTSConfig {
  voiceId?: string;
  resampleRate?: number;
  stability?: number;
  similarityBoost?: number;
  tempo?: number;
}

interface AudioChunk {
  audio?: string;  // base64 encoded
  isFinal?: boolean;
  error?: string;
}

/**
 * Normalize text for better TTS pronunciation (Vietnamese specific)
 */
export function normalizeText(text: string): string {
  const normalizeCurrencyAmounts = (input: string) => {
    /**
     * Make money amounts speak-friendly for Vietnamese TTS:
     * - "480.700 VNĐ" -> "480700 đồng"
     * - "1,234,000 VND" -> "1234000 đồng"
     *
     * Dot/comma thousand separators often create unwanted pauses ("480" ... "700"),
     * so we remove separators when the token is clearly a currency amount.
     */
    const withNormalizedAmounts = input.replace(
      /(?<!\d)(\d{1,3}(?:[.,]\d{3})+)\s*(VNĐ|VND|đồng|đ)(?![\p{L}\p{N}_])/giu,
      (_m, amount: string) => `${amount.replace(/[.,]/g, '')} đồng`
    );

    // Keep currency pronunciation stable even when amount has no separators.
    return withNormalizedAmounts
      .replace(/(?<![\p{L}\p{N}_])VNĐ(?![\p{L}\p{N}_])/giu, 'đồng')
      .replace(/(?<![\p{L}\p{N}_])VND(?![\p{L}\p{N}_])/giu, 'đồng');
  };

  const normalizeLicensePlates = (input: string) => {
    /**
     * VN plate patterns we handle:
     * - 29A-86256
     * - 30F1-12345
     * - 51H-123.45
     *
     * We rewrite to a speak-friendly form so TTS reads digits one-by-one:
     * - "29A-86256" -> "29 a 8 6 2 5 6"
     */
    const plateRegex =
      /(?<![\p{L}\p{N}_])(\d{2})([A-Za-z]{1,2}\d?)[-\s]?(\d{3,5})(?:[.\s-]?(\d{2}))?(?![\p{L}\p{N}_])/gu;
    return input.replace(plateRegex, (_m, province, series, block1, block2) => {
      const seriesText = String(series || '')
        .toLowerCase()
        .split('')
        .join(' ');
      const serialDigits = `${block1 ?? ''}${block2 ?? ''}`.replace(/\D/g, '');
      const serialText = serialDigits.split('').join(' ');
      return `${province} ${seriesText} ${serialText}`.trim();
    });
  };

  const expandAbbreviations = (input: string) => {
    /**
     * IMPORTANT:
     * Do NOT use `\b` for Vietnamese because diacritics are not treated as `\w`,
     * which can cause false word-boundaries (e.g. "khách" contains "kh" before "á").
     *
     * We only expand abbreviations when they appear as a standalone token, using
     * Unicode-aware boundaries.
     */
    const replaceToken = (s: string, token: string, replacement: string) => {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${token}(?![\\p{L}\\p{N}_])`, 'gu');
      return s.replace(re, replacement);
    };

    // Keep this list small + high-signal; extend as needed.
    let s = input;

    // Banking/support abbreviations (prefer ALL-CAPS forms)
    s = replaceToken(s, 'KH', 'khách hàng');
    s = replaceToken(s, 'CSKH', 'chăm sóc khách hàng');
    s = replaceToken(s, 'SPDV', 'sản phẩm dịch vụ');

    // Card/Banking common terms
    s = replaceToken(s, 'GNNĐ', 'ghi nợ nội địa');
    s = replaceToken(s, 'ATM', 'máy ây ti em');
    s = replaceToken(s, 'OTP', 'ô ti pi');
    s = replaceToken(s, 'PIN', 'pin');

    // App mentions (common lowercase)
    s = s.replace(/(?<![\p{L}\p{N}_])app(?![\p{L}\p{N}_])/giu, 'ứng dụng');

    // Proper nouns
    s = replaceToken(s, 'AppStore', 'App Store');
    s = replaceToken(s, 'GooglePlay', 'Google Play');

    return s;
  };

  return expandAbbreviations(normalizeCurrencyAmounts(normalizeLicensePlates(text)))
    // Addressing special-case: keep natural phrasing "anh chị"
    .replace(/anh\s*\/\s*chị/giu, 'anh chị')
    .replace(/Anh\s*\/\s*chị/gu, 'Anh chị')
    // Format time first (so ':' isn't removed before matching)
    .replace(/(\d{1,2}):(\d{2})/g, "$1 giờ $2")
    .replace(/→/g, "đến")
    // Replace slash with a more natural conjunction for Vietnamese lists
    .replace(/\//g, " hoặc ")
    // Replace remaining colon with space to avoid reading "hai chấm"
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split text into chunks for streaming TTS, prioritizing sentence boundaries.
 * Splits by periods, question marks, exclamation marks, semicolons, and newlines.
 * Also splits on commas if the chunk becomes too long (> 100 chars).
 */
function* textChunker(text: string): Generator<string> {
  // Normalize text first
  const normalizedText = normalizeText(text);

  // Regex to split by sentence terminators (. ? ! ; \n)
  const sentenceRegex = /[^.?!;\n]*[.?!;\n]+|[^.?!;\n]+$/g;
  const matches = normalizedText.match(sentenceRegex);

  if (matches) {
    for (const match of matches) {
      const trimmed = match.trim();
      if (!trimmed) continue;

      // If the sentence is too long (> 100 chars), try to split by comma
      if (trimmed.length > 100 && trimmed.includes(",")) {
        const parts = trimmed.split(/,/);
        let buffer = "";
        
        for (const part of parts) {
          if (buffer && (buffer.length + part.length + 1 > 80)) { // 80 char soft limit for sub-chunks
             yield buffer + ","; // Add comma back for pause
             buffer = part.trim();
          } else {
            buffer = buffer ? `${buffer}, ${part.trim()}` : part.trim();
          }
        }
        if (buffer) yield buffer;
      } else {
        yield trimmed;
      }
    }
  } else if (normalizedText) {
    yield normalizedText;
  }
}

/**
 * Generate TTS audio using WebSocket connection to TTS service
 * Returns audio data as Buffer chunks
 */
export async function generateTTSAudio(
  text: string,
  config: TTSConfig = {}
): Promise<Buffer[]> {
  const {
    voiceId = "phuongnhi-north",
    resampleRate = 8000,
    stability = parseFloat(ELEVEN_LABS_VOICE_STABILITY),
    similarityBoost = parseFloat(ELEVEN_LABS_VOICE_SIMILARITY_BOOST),
    tempo = TTS_TEMPO,
  } = config;

  return new Promise((resolve, reject) => {
    const audioChunks: Buffer[] = [];
    let isConnected = false;
    const startTime = Date.now();

    console.log(`[TTS] Connecting to ${TTS_WEBSOCKET_URI}...`);

    const ws = new WebSocket(TTS_WEBSOCKET_URI);

    // Set timeout for connection
    const connectionTimeout = setTimeout(() => {
      if (!isConnected) {
        ws.close();
        reject(new Error('TTS WebSocket connection timeout'));
      }
    }, 10000);

    ws.on('open', () => {
      isConnected = true;
      clearTimeout(connectionTimeout);
      console.log(`[TTS] Connected in ${Date.now() - startTime}ms`);

      // Send initial configuration
      const voiceSettings: Record<string, any> = {
        voiceId,
        resample_rate: resampleRate,
        stability,
        similarity_boost: similarityBoost,
      };
      if (tempo !== undefined) voiceSettings['tempo'] = tempo;
      const initialConfig = {
        text: " ",
        voice_settings: voiceSettings,
        generator_config: {
          chunk_length_schedule: [150],
        },
        xi_api_key: 'ws_3f9e7cba-d8e4-4b6a-9c73-9c9f5e2c8d21',
      };
      
      ws.send(JSON.stringify(initialConfig));
      console.log(`[TTS] Sent configuration`);
      
      // Send a single chunk to keep voice consistent.
      // Multi-chunk streaming can cause audible voice/prosody shifts on some TTS backends.
      const fullText = normalizeText(text);
      const chunkCount = 1;
      console.log(`[TTS] Sending chunk #1: ${fullText.substring(0, 80)}...`);
      ws.send(JSON.stringify({ text: fullText }));
      
      // Send empty text to signal end
      ws.send(JSON.stringify({ text: "" }));
      console.log(`[TTS] Finished sending ${chunkCount} text chunk`);
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message: AudioChunk = JSON.parse(data.toString());
        
        if (message.audio) {
          // Decode base64 audio data
          const audioBuffer = Buffer.from(message.audio, 'base64');
          audioChunks.push(audioBuffer);
          console.log(`[TTS] Received audio chunk #${audioChunks.length}, size: ${audioBuffer.length} bytes`);
        } else if (message.isFinal) {
          console.log(`[TTS] Finished. Total chunks: ${audioChunks.length}, total time: ${Date.now() - startTime}ms`);
          ws.close();
          resolve(audioChunks);
        } else if (message.error) {
          console.error(`[TTS] Error from TTS service: ${message.error}`);
          ws.close();
          reject(new Error(`TTS service error: ${message.error}`));
        }
      } catch (error) {
        console.error('[TTS] Error parsing message:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('[TTS] WebSocket error:', error);
      reject(error);
    });
    
    ws.on('close', () => {
      if (audioChunks.length === 0 && isConnected) {
        reject(new Error('TTS WebSocket closed without receiving audio'));
      }
    });
  });
}

export async function generateOfflineTTS(
  text: string,
  config: TTSConfig = {}
): Promise<Buffer> {
  const { voiceId = "500" } = config; 
  const token = "4a5vyvn37z4C5MNGYGsKw3dNo3Vdw4PG";
  // Use environment variable for offline API URL, fallback to default
  const url = process.env.TTS_OFFLINE_URL || "http://103.253.20.27:8096/api/v1/tts";

  const normalizedText = normalizeText(text);
  console.log(`[Offline TTS] Generating for: "${normalizedText.substring(0, 50)}..." with voiceId: ${voiceId} using ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({
      voiceId,
      text: normalizedText,
      token
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Offline TTS API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = (await response.json()) as {
    status?: number | string;
    msg?: string;
    data?: { url?: string; audio_url?: string };
  };
  
  // Check if successful based on response structure
  if (data.status !== 0 && data.status !== "0" && data.msg !== "Success!") {
     console.warn(`[Offline TTS] API returned status: ${data.status}, msg: ${data.msg}`);
     // Proceeding if URL is present anyway, otherwise throw?
     if (!data.data?.url && !data.data?.audio_url) {
        throw new Error(`Offline TTS API failed: ${data.msg}`);
     }
  }

  const audioUrl = data.data?.url || data.data?.audio_url;
  
  if (!audioUrl) {
    console.error('[Offline TTS] Response data:', data);
    throw new Error('No audio URL in response');
  }

  console.log(`[Offline TTS] Fetching audio from: ${audioUrl}`);

  // Fetch the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to fetch audio file from ${audioUrl}: ${audioResponse.statusText}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Stream TTS audio - yields audio chunks as they arrive
 */
export async function* streamTTSAudio(
  text: string,
  config: TTSConfig = {}
): AsyncGenerator<Buffer> {
  const {
    voiceId = "phuongnhi-north",
    resampleRate = 8000,
    stability = parseFloat(ELEVEN_LABS_VOICE_STABILITY),
    similarityBoost = parseFloat(ELEVEN_LABS_VOICE_SIMILARITY_BOOST),
    tempo = TTS_TEMPO,
  } = config;

  const ws = new WebSocket(TTS_WEBSOCKET_URI);
  const startTime = Date.now();

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => {
      console.log(`[TTS Stream] Connected in ${Date.now() - startTime}ms`);
      resolve();
    });
    ws.on('error', reject);

    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  // Send initial configuration
  const voiceSettings: Record<string, any> = {
    voiceId,
    resample_rate: resampleRate,
    stability,
    similarity_boost: similarityBoost,
  };
  if (tempo !== undefined) voiceSettings['tempo'] = tempo;
  ws.send(JSON.stringify({
    text: " ",
    voice_settings: voiceSettings,
    generator_config: {
      chunk_length_schedule: [20],
    },
    xi_api_key: 'ws_3f9e7cba-d8e4-4b6a-9c73-9c9f5e2c8d21',
  }));
  
  // Send text chunks
  let chunkCount = 0;
  for (const chunk of textChunker(text)) {
    chunkCount++;
    ws.send(JSON.stringify({ text: chunk }));
  }
  ws.send(JSON.stringify({ text: "" }));
  console.log(`[TTS Stream] Sent ${chunkCount} text chunks`);
  
  // Stream audio chunks
  let audioChunkCount = 0;

  // Use a custom async iterator because 'ws' doesn't support async iteration by default in all environments
  const messageQueue: any[] = [];
  const resolvers: ((value: any) => void)[] = [];
  let isClosed = false;
  let error: Error | null = null;

  ws.on('message', (data) => {
    if (resolvers.length > 0) {
      const resolve = resolvers.shift()!;
      resolve({ value: data, done: false });
    } else {
      messageQueue.push(data);
    }
  });

  ws.on('close', () => {
    isClosed = true;
    while (resolvers.length > 0) {
      const resolve = resolvers.shift()!;
      resolve({ value: undefined, done: true });
    }
  });

  ws.on('error', (err) => {
    error = err;
    while (resolvers.length > 0) {
      const resolve = resolvers.shift()!;
      resolve({ value: undefined, done: true }); // Or reject?
    }
  });

  const asyncIterator = {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      if (error) throw error;
      if (messageQueue.length > 0) {
        return { value: messageQueue.shift(), done: false };
      }
      if (isClosed) {
        return { value: undefined, done: true };
      }
      return new Promise<any>((resolve) => {
        resolvers.push(resolve);
      });
    }
  };

  for await (const data of asyncIterator) {
    try {
      const message: AudioChunk = JSON.parse(data.toString());
      
      if (message.audio) {
        audioChunkCount++;
        const audioBuffer = Buffer.from(message.audio, 'base64');
        console.log(`[TTS Stream] Yielding audio chunk #${audioChunkCount}`);
        yield audioBuffer;
      } else if (message.isFinal) {
        console.log(`[TTS Stream] Complete. Total chunks: ${audioChunkCount}`);
        break;
      } else if (message.error) {
        throw new Error(`TTS service error: ${message.error}`);
      }
    } catch (error) {
      console.error('[TTS Stream] Error:', error);
      throw error;
    }
  }
  
  ws.close();
}

/**
 * Streaming TTS client — allows sending text incrementally (e.g. token-by-token
 * from an LLM) instead of waiting for the full response. Audio chunks are
 * yielded as they arrive from the TTS server.
 */
export class StreamingTTS {
  private ws: WebSocket | null = null
  private audioQueue: Buffer[] = []
  private audioWaiters: ((result: IteratorResult<Buffer>) => void)[] = []
  private done = false
  private wsError: Error | null = null
  private pendingTexts: string[] = []
  private connected = false
  private config: TTSConfig

  constructor(config: TTSConfig = {}) {
    this.config = config
  }

  async connect(): Promise<void> {
    const {
      voiceId = 'phuongnhi-north',
      resampleRate = 8000,
      stability = parseFloat(ELEVEN_LABS_VOICE_STABILITY),
      similarityBoost = parseFloat(ELEVEN_LABS_VOICE_SIMILARITY_BOOST),
      tempo = TTS_TEMPO,
    } = this.config

    this.ws = new WebSocket(TTS_WEBSOCKET_URI)
    const startTime = Date.now()

    await new Promise<void>((resolve, reject) => {
      this.ws!.on('open', () => {
        console.log(`[TTS Streaming] Connected in ${Date.now() - startTime}ms`)
        resolve()
      })
      this.ws!.on('error', reject)
      setTimeout(() => reject(new Error('TTS streaming connection timeout')), 10000)
    })

    // Send initial configuration
    const voiceSettings: Record<string, any> = {
      voiceId,
      resample_rate: resampleRate,
      stability,
      similarity_boost: similarityBoost,
    }
    if (tempo !== undefined) voiceSettings.tempo = tempo

    this.ws.send(JSON.stringify({
      text: ' ',
      voice_settings: voiceSettings,
      generator_config: { chunk_length_schedule: [20] },
      xi_api_key: 'ws_3f9e7cba-d8e4-4b6a-9c73-9c9f5e2c8d21',
    }))

    // Wire up audio receiving
    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg: AudioChunk = JSON.parse(data.toString())
        if (msg.audio) {
          const buf = Buffer.from(msg.audio, 'base64')
          if (this.audioWaiters.length > 0) {
            this.audioWaiters.shift()!({ value: buf, done: false })
          } else {
            this.audioQueue.push(buf)
          }
        } else if (msg.isFinal) {
          this.done = true
          for (const w of this.audioWaiters) w({ value: undefined as any, done: true })
          this.audioWaiters = []
        } else if (msg.error) {
          this.wsError = new Error(`TTS service error: ${msg.error}`)
          this.done = true
          for (const w of this.audioWaiters) w({ value: undefined as any, done: true })
          this.audioWaiters = []
        }
      } catch {}
    })

    this.ws.on('close', () => {
      this.done = true
      for (const w of this.audioWaiters) w({ value: undefined as any, done: true })
      this.audioWaiters = []
    })

    this.ws.on('error', (err: Error) => {
      this.wsError = err
      this.done = true
      for (const w of this.audioWaiters) w({ value: undefined as any, done: true })
      this.audioWaiters = []
    })

    this.connected = true

    // Flush any text that was queued before connection completed
    for (const t of this.pendingTexts) {
      this.ws.send(JSON.stringify({ text: t }))
    }
    this.pendingTexts = []
  }

  /** Send a text chunk to TTS. Normalizes text before sending. */
  sendText(text: string): void {
    const normalized = normalizeText(text)
    if (!normalized) return
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text: normalized }))
    } else {
      this.pendingTexts.push(normalized)
    }
  }

  /** Signal end of text input. */
  finish(): void {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text: '' }))
    }
  }

  /** Async generator yielding audio Buffer chunks as they arrive. */
  async *audioChunks(): AsyncGenerator<Buffer> {
    while (true) {
      if (this.wsError) throw this.wsError
      if (this.audioQueue.length > 0) {
        yield this.audioQueue.shift()!
        continue
      }
      if (this.done) return
      const result = await new Promise<IteratorResult<Buffer>>((resolve) => {
        this.audioWaiters.push(resolve)
      })
      if (result.done) return
      yield result.value
    }
  }

  close(): void {
    try { this.ws?.close() } catch {}
    this.ws = null
    this.connected = false
  }
}

/**
 * Test TTS connection
 */
export async function testTTSConnection(): Promise<boolean> {
  try {
    const ws = new WebSocket(TTS_WEBSOCKET_URI);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      
      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

