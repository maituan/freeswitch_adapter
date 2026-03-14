import { useState, useRef, useEffect } from 'react';

export interface ASRResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export interface UseASRReturn {
  isRecording: boolean;
  isConnected: boolean;
  transcript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
  error: string | null;
}

function resolveAsrProxyUrl(): string {
  const configured = process.env.NEXT_PUBLIC_ASR_PROXY_URL;

  // SSR-safe fallback.
  if (typeof window === 'undefined') {
    return configured || 'ws://localhost:8082';
  }

  const pageIsHttps = window.location.protocol === 'https:';
  const desiredProtocol = pageIsHttps ? 'wss:' : 'ws:';

  // If env is not provided, derive from current host.
  if (!configured) {
    return `${desiredProtocol}//${window.location.hostname}:8082`;
  }

  try {
    const parsed = new URL(configured);

    // Prevent remote users from trying to connect to their own localhost.
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      parsed.hostname = window.location.hostname;
    }

    // Avoid mixed-content when page is HTTPS.
    if (pageIsHttps && parsed.protocol === 'ws:') {
      parsed.protocol = 'wss:';
    }

    return parsed.toString();
  } catch {
    // If malformed env, fallback to safe derived URL.
    return `${desiredProtocol}//${window.location.hostname}:8082`;
  }
}

const ASR_PROXY_URL = resolveAsrProxyUrl();

interface UseASROptions {
  onFinal?: (text: string) => void;
  enabled?: boolean;
}

export function useASR(options: UseASROptions = {}): UseASRReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const onFinalRef = useRef(options.onFinal);
  const enabled = options.enabled ?? true;

  // Update ref if option changes
  useEffect(() => {
    onFinalRef.current = options.onFinal;
  }, [options.onFinal]);

  // Connect WebSocket only when ASR is enabled.
  useEffect(() => {
    if (!enabled) {
      cleanup();
      setIsConnected(false);
      return;
    }
    connectWS();
    return () => {
      cleanup();
    };
  }, [enabled]);

  const connectWS = () => {
    try {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(ASR_PROXY_URL);
        
        ws.onopen = () => {
            console.log('[useASR] Connected to ASR Proxy');
            setIsConnected(true);
            setError(null);
        };

        ws.onclose = () => {
            console.log('[useASR] Disconnected from ASR Proxy');
            setIsConnected(false);
        };

        ws.onerror = (ev) => {
            console.error('[useASR] WebSocket error', ev);
            setError('Connection error');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'transcript') {
                    const result = msg.data as ASRResult;
                    
                    if (result.isFinal) {
                        // Khi câu đã chốt (isFinal=true)
                        // 1. Gọi callback để gửi đi
                        if (onFinalRef.current) {
                            onFinalRef.current(result.transcript);
                        }
                        // 2. Clear transcript để bắt đầu câu mới sạch sẽ
                        setTranscript(''); 
                    } else {
                        // Đang nói dở dang
                        setTranscript(result.transcript);
                    }
                } else if (msg.type === 'error') {
                    setError(msg.message);
                }
            } catch (e) {
                console.error('[useASR] Parse error', e);
            }
        };

        wsRef.current = ws;
    } catch (e) {
        console.error('WebSocket Init Error:', e);
    }
  };

  const cleanup = () => {
    stopRecording();
    if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
    }
  };

  const processAudio = (audioProcessingEvent: AudioProcessingEvent) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const inputBuffer = audioProcessingEvent.inputBuffer;
    const inputData = inputBuffer.getChannelData(0); // Mono
    const inputRate = inputBuffer.sampleRate;
    const outputRate = 8000;

    // Downsample and convert to Int16
    const pcmData = downsampleBuffer(inputData, inputRate, outputRate);
    
    // Send binary data
    wsRef.current.send(pcmData);
  };

  const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number): Int16Array => {
      if (outputRate === inputRate) {
          return floatTo16BitPCM(buffer);
      }
      const compression = inputRate / outputRate;
      const length = Math.floor(buffer.length / compression);
      const result = new Int16Array(length);
  
      for (let i = 0; i < length; i++) {
          const inputIndex = Math.floor(i * compression);
          // Simple decimation (nearest neighbor) - can be improved with filtering
          const s = Math.max(-1, Math.min(1, buffer[inputIndex]));
          result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return result;
  };

  const floatTo16BitPCM = (output: Float32Array): Int16Array => {
      const result = new Int16Array(output.length);
      for (let i = 0; i < output.length; i++) {
          const s = Math.max(-1, Math.min(1, output[i]));
          result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return result;
  };

  const startRecording = async () => {
    try {
      if (!enabled) return;
      if (isRecording) return;
      if (!isConnected) {
        connectWS();
        // Wait a bit? Or just fail?
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            // Try to wait for connection
            await new Promise(r => setTimeout(r, 500));
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }
        }
      }

      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      inputRef.current = source;

      // Buffer size 4096 gives ~0.085s latency at 48kHz, good enough
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = processAudio;
      processorRef.current = processor;

      source.connect(processor);
      // Keep the node graph "alive" without outputting audio (avoid feedback/echo)
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      // Send start command
      wsRef.current?.send(JSON.stringify({ type: 'start' }));
      
      setIsRecording(true);
    } catch (err: any) {
      console.error('[useASR] Start error:', err);
      setError(err.message || 'Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;

    // Stop audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Disconnect nodes
    if (processorRef.current && inputRef.current) {
      inputRef.current.disconnect();
      processorRef.current.disconnect();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Send stop command
    if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    setIsRecording(false);
  };

  const clearTranscript = () => {
      setTranscript('');
  };

  return {
    isRecording,
    isConnected,
    transcript,
    startRecording,
    stopRecording,
    clearTranscript,
    error,
  };
}

