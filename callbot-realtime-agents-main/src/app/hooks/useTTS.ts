import { useState, useCallback, useRef, useEffect } from 'react';

export interface TTSOptions {
  voiceId?: string;
  resampleRate?: 8000 | 16000;
  mode?: 'streaming' | 'offline';
  onStart?: () => void;  // Callback khi bắt đầu phát audio
  onEnd?: () => void;    // Callback khi kết thúc phát audio
}

export interface TTSState {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useTTS() {
  const [state, setState] = useState<TTSState>({
    isPlaying: false,
    isLoading: false,
    error: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // MediaStreamDestination để capture TTS audio cho recording
  const mediaStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Initialize AudioContext và MediaStreamDestination
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Tạo MediaStreamDestination để capture TTS audio
      mediaStreamDestRef.current = audioContextRef.current.createMediaStreamDestination();
    }

    return () => {
      // Cleanup on unmount
      stop();
      audioContextRef.current?.close();
    };
  }, []);

  const speak = useCallback(async (
    text: string,
    options: TTSOptions = {}
  ) => {
    if (!text.trim()) {
      setState(prev => ({ ...prev, error: 'Text is required' }));
      return;
    }

    // Remove control tags before sending to TTS
    // - Trailing control tags used by our app: |CHAT, |FORWARD, |ENDCALL
    // - Optional legacy tags that should NEVER be spoken (e.g., |HANDOFF/xxx)
    const cleanText = text
      .replace(/\|HANDOFF(?:\/[^\s]+)?/gi, '') // anywhere
      .replace(/\s*\|(CHAT|FORWARD|ENDCALL)\s*$/gi, '') // trailing
      .trim();
    
    if (!cleanText) {
      setState(prev => ({ ...prev, error: 'Text is empty after removing tags' }));
      return;
    }

    // Stop any currently playing audio
    stop();

    setState({
      isPlaying: false,
      isLoading: true,
      error: null,
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { voiceId = 'phuongnhi-north', resampleRate = 8000 } = options;
      const requestedMode: 'streaming' | 'offline' = options.mode ?? 'streaming';
      // Force streaming mode (offline often requires fetching a remote WAV which can timeout).
      const mode: 'streaming' | 'offline' = requestedMode === 'offline' ? 'streaming' : requestedMode;

      console.log(`[TTS] Generating speech (${mode}) for text:`, cleanText.substring(0, 50) + '...');

      // Call Next.js API endpoint
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          voiceId,
          resampleRate,
          mode,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const details = (errorData?.details ? ` (${errorData.details})` : '');
        throw new Error((errorData?.error || 'TTS generation failed') + details);
      }

      // Get audio data as ArrayBuffer
      const audioData = await response.arrayBuffer();

      if (abortController.signal.aborted) {
        console.log('[TTS] Request was aborted');
        return;
      }

      const audioContext = audioContextRef.current;
      if (!audioContext) {
        throw new Error('AudioContext not available');
      }

      // We force streaming mode: server returns raw PCM (16-bit signed integers) without header
      const pcmData = new Int16Array(audioData);
      const audioBuffer = audioContext.createBuffer(
        1, // mono
        pcmData.length,
        resampleRate
      );

      // Convert Int16 PCM to Float32 for Web Audio API
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768.0; // Normalize to -1.0 to 1.0
      }

      // Create and play audio source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      // Connect to destination for playback
      source.connect(audioContext.destination);
      // Also connect to MediaStreamDestination for recording
      if (mediaStreamDestRef.current) {
        source.connect(mediaStreamDestRef.current);
      }

      // Handle playback end
      source.onended = () => {
        console.log('[TTS] Playback finished');
        setState({
          isPlaying: false,
          isLoading: false,
          error: null,
        });
        audioSourceRef.current = null;
        // Callback khi kết thúc
        options.onEnd?.();
      };

      // Start playback
      source.start(0);
      audioSourceRef.current = source;

      setState({
        isPlaying: true,
        isLoading: false,
        error: null,
      });

      console.log('[TTS] Playback started');
      // Callback khi bắt đầu
      options.onStart?.();

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[TTS] Request aborted');
        setState({
          isPlaying: false,
          isLoading: false,
          error: null,
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[TTS] Error:', errorMessage);
        setState({
          isPlaying: false,
          isLoading: false,
          error: errorMessage,
        });
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    // Stop current playback
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // Ignore errors if already stopped
      }
      audioSourceRef.current = null;
    }

    // Abort pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState({
      isPlaying: false,
      isLoading: false,
      error: null,
    });
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/tts');
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[TTS] Health check failed:', error);
      return null;
    }
  }, []);

  // Getter để lấy MediaStream của TTS audio (dùng cho recording)
  const getTTSStream = useCallback((): MediaStream | null => {
    return mediaStreamDestRef.current?.stream || null;
  }, []);

  return {
    speak,
    stop,
    checkHealth,
    getTTSStream,
    ...state,
  };
}

