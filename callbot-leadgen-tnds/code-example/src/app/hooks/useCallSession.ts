import { useState, useCallback, useRef } from 'react';

export interface UseCallSessionOptions {
  onSendToBot: (text: string) => void;
  getUserText: () => string;
  clearUserText: () => void;
  onEndCall?: () => void;  // Callback khi ENDCALL được trigger
}

export interface UseCallSessionReturn {
  isFirstGreetingPlayed: boolean;
  isTTSPlaying: boolean;
  isMicEnabled: boolean;
  handleTTSStart: () => void;
  handleTTSEnd: (isEndCall?: boolean) => void;
  onASRFinal: (text: string) => void;
  triggerEndCall: () => void;  // Trigger ENDCALL manually
}

/**
 * Hook điều phối luồng call giữa TTS và ASR
 * 
 * Luồng:
 * 1. Bot chào (TTS) → Mic disabled
 * 2. TTS xong → Mic enabled, ASR start
 * 3. User nói → Text hiển thị trong ô input (chưa gửi)
 * 4. isFinal=true → Check TTS:
 *    - TTS đang phát → queue (pendingSend=true)
 *    - TTS không phát → gửi ngay
 * 5. TTS kết thúc → Check pendingSend, gửi nếu có
 */
export function useCallSession(options: UseCallSessionOptions): UseCallSessionReturn {
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  const [isFirstGreetingPlayed, setIsFirstGreetingPlayed] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  
  // Flag: có text chờ gửi không? (user nói xong trong khi TTS đang phát)
  const pendingSendRef = useRef(false);
  
  // Ref để tránh stale closure trong callbacks
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const handleTTSStart = useCallback(() => {
    console.log('[CallSession] TTS started');
    setIsTTSPlaying(true);
    // While bot is speaking, pause mic/ASR to avoid loopback / ASR noise.
    setIsMicEnabled(false);
  }, []);

  const handleTTSEnd = useCallback((isEndCall: boolean = false) => {
    console.log('[CallSession] TTS ended, isEndCall:', isEndCall);
    setIsTTSPlaying(false);
    
    // Nếu là ENDCALL → trigger shutdown
    if (isEndCall) {
      console.log('[CallSession] ENDCALL detected, triggering end call');
      setIsMicEnabled(false);
      optionsRef.current.onEndCall?.();
      return;
    }
    
    // Lần đầu TTS kết thúc → mark greeting done
    if (!isFirstGreetingPlayed) {
      console.log('[CallSession] First greeting done, enabling mic');
      setIsFirstGreetingPlayed(true);
    }

    // After any TTS ends (and not ENDCALL), re-enable mic/ASR
    setIsMicEnabled(true);
    
    // Nếu có text đang chờ (user đã nói xong trong lúc TTS) → gửi ngay
    if (pendingSendRef.current) {
      const text = optionsRef.current.getUserText();
      console.log('[CallSession] Sending queued text:', text);
      if (text.trim()) {
        optionsRef.current.onSendToBot(text.trim());
        optionsRef.current.clearUserText();
      }
      pendingSendRef.current = false;
    }
  }, [isFirstGreetingPlayed]);

  const triggerEndCall = useCallback(() => {
    console.log('[CallSession] Manual end call triggered');
    setIsMicEnabled(false);
    optionsRef.current.onEndCall?.();
  }, []);

  const onASRFinal = useCallback((text: string) => {
    // Text đã được set vào ô input bởi ASR hook
    console.log('[CallSession] ASR final:', text, 'TTS playing:', isTTSPlaying);
    
    if (isTTSPlaying) {
      // TTS đang phát → đánh dấu chờ, KHÔNG gửi
      pendingSendRef.current = true;
      console.log('[CallSession] TTS playing, queuing text for later');
    } else {
      // TTS không phát → gửi ngay
      if (text.trim()) {
        console.log('[CallSession] Sending text immediately:', text);
        optionsRef.current.onSendToBot(text.trim());
        optionsRef.current.clearUserText();
      }
    }
  }, [isTTSPlaying]);

  return {
    isFirstGreetingPlayed,
    isTTSPlaying,
    isMicEnabled,
    handleTTSStart,
    handleTTSEnd,
    onASRFinal,
    triggerEndCall,
  };
}

