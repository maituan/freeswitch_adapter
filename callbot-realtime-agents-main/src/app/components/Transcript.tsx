"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TranscriptItem } from "@/app/types";
import Image from "next/image";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { DownloadIcon, ClipboardCopyIcon, SpeakerLoudIcon, StopIcon } from "@radix-ui/react-icons";
import { GuardrailChip } from "./GuardrailChip";
import { useASR } from "@/app/hooks/useASR";
import { useCallSession } from "@/app/hooks/useCallSession";

// TTS interface từ useTTS hook
interface TTSInstance {
  speak: (text: string, options?: { mode?: 'streaming' | 'offline'; onStart?: () => void; onEnd?: () => void }) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  getTTSStream: () => MediaStream | null;
}

// Fallback icon for Mic if not available
const MicrophoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.5 0.875C6.46447 0.875 5.625 1.71447 5.625 2.75V7.25C5.625 8.28553 6.46447 9.125 7.5 9.125C8.53553 9.125 9.375 8.28553 9.375 7.25V2.75C9.375 1.71447 8.53553 0.875 7.5 0.875ZM4.625 2.75C4.625 1.16218 5.91218 -0.125 7.5 -0.125C9.08782 -0.125 10.375 1.16218 10.375 2.75V7.25C10.375 8.83782 9.08782 10.125 7.5 10.125C5.91218 10.125 4.625 8.83782 4.625 7.25V2.75ZM2.5 7.25C2.5 7.66421 2.83579 8 3.25 8C3.66421 8 4 7.66421 4 7.25C4 5.317 5.567 3.75 7.5 3.75C9.433 3.75 11 5.317 11 7.25C11 7.66421 11.3358 8 11.75 8C12.1642 8 12.5 7.66421 12.5 7.25C12.5 4.75783 10.6865 2.68615 8.29801 2.30232C8.36166 2.44146 8.375 2.59369 8.375 2.75V7.25C8.375 7.73325 7.98325 8.125 7.5 8.125C7.01675 8.125 6.625 7.73325 6.625 7.25V2.75C6.625 2.59369 6.63834 2.44146 6.70199 2.30232C4.31354 2.68615 2.5 4.75783 2.5 7.25ZM7.5 11.125C9.57107 11.125 11.25 9.44607 11.25 7.375H12.25C12.25 9.80305 10.4682 11.8087 8.125 12.096V14.125H10.125C10.5392 14.125 10.875 14.4608 10.875 14.875C10.875 15.2892 10.5392 15.625 10.125 15.625H4.875C4.46079 15.625 4.125 15.2892 4.125 14.875C4.125 14.4608 4.46079 14.125 4.875 14.125H6.875V12.096C4.53177 11.8087 2.75 9.80305 2.75 7.375H3.75C3.75 9.44607 5.42893 11.125 7.5 11.125Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
  </svg>
);

export interface TranscriptProps {
  userText: string;
  setUserText: (val: string) => void;
  onSendMessage: (overrideText?: string) => void;
  canSend: boolean;
  downloadRecording: () => void;
  enableTTS?: boolean;
  autoPlayTTS?: boolean;
  ttsMode?: 'streaming' | 'offline';
  tts: TTSInstance;
  agentSetKey?: string;
  onEndCall?: () => void;  // Callback khi ENDCALL được trigger
  chatOnly?: boolean;
}

function Transcript({
  userText,
  setUserText,
  onSendMessage,
  canSend,
  downloadRecording,
  enableTTS = true,
  autoPlayTTS = false,
  ttsMode = 'streaming',
  tts,
  agentSetKey,
  onEndCall,
  chatOnly = false,
}: TranscriptProps) {
  const { transcriptItems, toggleTranscriptItemExpand } = useTranscript();
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [prevLogs, setPrevLogs] = useState<TranscriptItem[]>([]);
  const [justCopied, setJustCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Destructure TTS from props instead of calling useTTS
  const { speak, stop, isPlaying, isLoading } = tts;
  const [playingItemId, setPlayingItemId] = useState<string | null>(null);
  const lastAutoPlayedIdRef = useRef<string | null>(null);
  const pendingAutoPlayRef = useRef<{ itemId: string; text: string; timer: number | null } | null>(
    null,
  );
  const leadgenOpeningPlayedRef = useRef(false);

  // Ref để lấy userText hiện tại (tránh stale closure)
  const userTextRef = useRef(userText);
  useEffect(() => { userTextRef.current = userText; }, [userText]);

  // Hook điều phối call - quản lý TTS/ASR coordination
  const callSession = useCallSession({
    onSendToBot: (text) => onSendMessage(text),
    getUserText: () => userTextRef.current,
    clearUserText: () => setUserText(''),
    onEndCall: () => {
      console.log('[Transcript] ENDCALL triggered, stopping ASR and disconnecting');
      stopASR();
      onEndCall?.();
    },
  });

  const { 
    isRecording: isASRRecording, 
    startRecording: startASR, 
    stopRecording: stopASR, 
    transcript: partialTranscript, 
    error: asrError 
  } = useASR({
    enabled: !chatOnly,
    onFinal: (finalText) => {
      // Khi nhận được câu hoàn chỉnh (isFinal=true) từ server
      console.log("[Transcript] ASR final text:", finalText);
      
      // 1. Cập nhật UI
      setUserText(finalText);
      
      // 2. Để call session quyết định gửi hay queue
      // (Nếu TTS đang phát → queue, nếu không → gửi ngay)
      callSession.onASRFinal(finalText);
    }
  });

  // Log ASR errors if any
  useEffect(() => {
    if (asrError) {
      console.error("[Transcript] ASR Error:", asrError);
    }
  }, [asrError]);

  // Update user text with partial results (cho người dùng thấy chữ chạy)
  useEffect(() => {
    if (partialTranscript && isASRRecording) {
        setUserText(partialTranscript);
    }
  }, [partialTranscript, isASRRecording]);

  function scrollToBottom() {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }

  useEffect(() => {
    const hasNewMessage = transcriptItems.length > prevLogs.length;
    const hasUpdatedMessage = transcriptItems.some((newItem, index) => {
      const oldItem = prevLogs[index];
      return (
        oldItem &&
        (newItem.title !== oldItem.title || newItem.data !== oldItem.data)
      );
    });

    if (hasNewMessage || hasUpdatedMessage) {
      scrollToBottom();
    }

    setPrevLogs(transcriptItems);
  }, [transcriptItems]);

  // Autofocus on text box input on load
  useEffect(() => {
    if (canSend && inputRef.current) {
      inputRef.current.focus();
    }
  }, [canSend]);

  const handleCopyTranscript = async () => {
    if (!transcriptRef.current) return;
    try {
      await navigator.clipboard.writeText(transcriptRef.current.innerText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
    } catch (error) {
      console.error("Failed to copy transcript:", error);
    }
  };

  const handlePlayTTS = async (itemId: string, text: string) => {
    if (playingItemId === itemId && isPlaying) {
      // Stop if currently playing this item
      stop();
      setPlayingItemId(null);
      callSession.handleTTSEnd();
    } else {
      // Play new item
      stop(); // Stop any current playback
      setPlayingItemId(itemId);
      
      // Detect if this message has ENDCALL tag
      const isEndCallMessage = /\|ENDCALL\s*$/i.test(text);
      
      callSession.handleTTSStart();
      await speak(text, { 
        mode: ttsMode,
        onEnd: () => {
          setPlayingItemId(null);
          callSession.handleTTSEnd(isEndCallMessage);
        }
      });
    }
  };

  // Stop TTS when component unmounts
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Auto-start ASR khi mic được enable (sau greeting đầu tiên)
  useEffect(() => {
    if (chatOnly) return;
    if (callSession.isMicEnabled && !isASRRecording) {
      console.log('[Transcript] First greeting done, auto-starting ASR');
      startASR();
    }
  }, [chatOnly, callSession.isMicEnabled, isASRRecording, startASR]);

  // Stop ASR ngay khi mic bị disable (thường là lúc TTS đang phát) để tránh loopback/ASR ra linh tinh
  useEffect(() => {
    if (chatOnly) return;
    if (!callSession.isMicEnabled && isASRRecording) {
      console.log('[Transcript] Mic disabled, stopping ASR');
      stopASR();
    }
  }, [chatOnly, callSession.isMicEnabled, isASRRecording, stopASR]);

  useEffect(() => {
    if (!chatOnly) return;
    if (isASRRecording) stopASR();
  }, [chatOnly, isASRRecording, stopASR]);

  // Auto-play TTS for assistant messages:
  // We MUST avoid speaking on partial streaming updates (often starts with just "Anh...").
  // Strategy: wait until the latest assistant message text is stable for a short window.
  useEffect(() => {
    if (!autoPlayTTS || !enableTTS) return;

    // Find the latest assistant message
    const assistantMessages = transcriptItems
      .filter(item => 
        item.type === "MESSAGE" && 
        item.role === "assistant" &&
        item.title &&
        !item.title.startsWith("[") &&
        !item.title.endsWith("]")
      )
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const latestMessage = assistantMessages[0];

    if (!latestMessage) return;
    if (latestMessage.itemId === lastAutoPlayedIdRef.current) return;
    if (isPlaying || isLoading) return;

    const latestText = String(latestMessage.title || '').trim();
    if (!latestText) return;

    // For leadgenTNDS: do not autoplay any first assistant message
    // unless it is the required opening sentence with full context.
    if (agentSetKey === 'leadgenTNDS' && !leadgenOpeningPlayedRef.current) {
      const looksLikeOpening =
        latestText.startsWith('Dạ ') &&
        latestText.includes('xe biển số') &&
        latestText.includes('Em viết nối hạn luôn');
      if (!looksLikeOpening) return;
    }

    const pending = pendingAutoPlayRef.current;
    const isSamePending = pending?.itemId === latestMessage.itemId;
    const hasTextChanged = !isSamePending || pending?.text !== latestText;

    // Reset timer if message is new or its text is still changing.
    if (hasTextChanged) {
      if (pending?.timer) window.clearTimeout(pending.timer);
      pendingAutoPlayRef.current = {
        itemId: latestMessage.itemId,
        text: latestText,
        timer: window.setTimeout(() => {
          const cur = pendingAutoPlayRef.current;
          if (!cur) return;
          if (cur.itemId !== latestMessage.itemId) return;
          if (cur.text !== latestText) return;
          if (isPlaying || isLoading) return;
          if (latestMessage.itemId === lastAutoPlayedIdRef.current) return;

          const isEndCallMessage = /\|ENDCALL\s*$/i.test(latestText);
          console.log(
            `[Auto TTS] Playing (${ttsMode}):`,
            latestText.substring(0, 50),
            isEndCallMessage ? '[ENDCALL]' : '',
          );

          lastAutoPlayedIdRef.current = latestMessage.itemId;
          setPlayingItemId(latestMessage.itemId);
          callSession.handleTTSStart();

          speak(latestText, {
            mode: ttsMode,
            onStart: () => {
              console.log('[Transcript] TTS playback started');
            },
            onEnd: () => {
              console.log('[Transcript] TTS playback ended', isEndCallMessage ? '[ENDCALL]' : '');
              setPlayingItemId(null);
              if (
                agentSetKey === 'leadgenTNDS' &&
                latestText.startsWith('Dạ ') &&
                latestText.includes('xe biển số') &&
                latestText.includes('Em viết nối hạn luôn')
              ) {
                leadgenOpeningPlayedRef.current = true;
              }
              callSession.handleTTSEnd(isEndCallMessage);
            },
          });
        }, 650),
      };
    }
  }, [transcriptItems, autoPlayTTS, enableTTS, isPlaying, isLoading, speak, ttsMode, callSession, agentSetKey]);

  // Cleanup any pending autoplay timer on unmount.
  useEffect(() => {
    return () => {
      const pending = pendingAutoPlayRef.current;
      if (pending?.timer) window.clearTimeout(pending.timer);
      pendingAutoPlayRef.current = null;
    };
  }, []);

  const visibleTranscriptItems = React.useMemo(() => {
    const sorted = [...transcriptItems].sort((a, b) => a.createdAtMs - b.createdAtMs);
    if (agentSetKey !== 'leadgenTNDS') return sorted;

    let hasValidOpening = false;
    let lastUserText = '';
    const normalize = (v: string) =>
      String(v || '')
        .toLowerCase()
        .replace(/đ/g, 'd')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return sorted.filter((item) => {
      if (item.type === 'MESSAGE' && item.role === 'user') {
        lastUserText = normalize(String(item.title || ''));
        return true;
      }

      if (!(item.type === 'MESSAGE' && item.role === 'assistant')) return true;
      const text = String(item.title || '').trim();
      if (!text) return true;
      const normalizedText = normalize(text);

      const asksIdentityOrLocation =
        lastUserText.includes('em o dau') ||
        lastUserText.includes('o ben nao') ||
        lastUserText.includes('ben nao') ||
        lastUserText.includes('em la ai') ||
        lastUserText.includes('bao hiem gi');

      // Hide invalid fallback line on identity/location FAQ turns.
      if (asksIdentityOrLocation && normalizedText.includes('forward')) {
        return false;
      }

      const looksLikeValidOpening =
        text.startsWith('Dạ ') &&
        text.includes('xe biển số') &&
        text.includes('Em viết nối hạn luôn');

      if (!hasValidOpening) {
        if (looksLikeValidOpening) {
          hasValidOpening = true;
          return true;
        }

        const lower = text.toLowerCase();
        const isWrongOpening =
          lower.includes('chào anh/chị') ||
          lower.includes('em ở bên bảo hiểm xe ô tô í anh/chị') ||
          lower.includes('anh/chị có muốn em viết nối hạn luôn không') ||
          lower.includes('xin phép hỏi anh/chị tên') ||
          lower.includes('họ tên hoặc số điện thoại');
        if (isWrongOpening) return false;
      }

      return true;
    });
  }, [transcriptItems, agentSetKey]);

  return (
    <div className="flex flex-col flex-1 bg-white min-h-0 rounded-xl">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10 text-base border-b bg-white rounded-t-xl">
          <span className="font-semibold">Transcript</span>
          <div className="flex gap-x-2">
            <button
              onClick={handleCopyTranscript}
              className="w-24 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <ClipboardCopyIcon />
              {justCopied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={downloadRecording}
              className="w-40 text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 flex items-center justify-center gap-x-1"
            >
              <DownloadIcon />
              <span>Download Audio</span>
            </button>
          </div>
        </div>

        {/* Transcript Content */}
        <div
          ref={transcriptRef}
          className="overflow-auto p-4 flex flex-col gap-y-4 h-full"
        >
          {visibleTranscriptItems.map((item) => {
              const {
                itemId,
                type,
                role,
                data,
                expanded,
                timestamp,
                title = "",
                isHidden,
                guardrailResult,
              } = item;

            if (isHidden) {
              return null;
            }

            if (type === "MESSAGE") {
              const isUser = role === "user";
              const containerClasses = `flex justify-end flex-col ${
                isUser ? "items-end" : "items-start"
              }`;
              const bubbleBase = `max-w-lg p-3 ${
                isUser ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-black"
              }`;
              const isBracketedMessage =
                title.startsWith("[") && title.endsWith("]");
              const messageStyle = isBracketedMessage
                ? 'italic text-gray-400'
                : '';
              const displayTitle = isBracketedMessage
                ? title.slice(1, -1)
                : title;

              const isPlayingThis = playingItemId === itemId && isPlaying;
              const isLoadingThis = playingItemId === itemId && isLoading;

              return (
                <div key={itemId} className={containerClasses}>
                  <div className="max-w-lg">
                    <div
                      className={`${bubbleBase} rounded-t-xl ${
                        guardrailResult ? "" : "rounded-b-xl"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div
                          className={`text-xs ${
                            isUser ? "text-gray-400" : "text-gray-500"
                          } font-mono`}
                        >
                          {timestamp}
                        </div>
                        {/* TTS Button - Only show for assistant messages */}
                        {!isUser && enableTTS && displayTitle && !isBracketedMessage && (
                          <button
                            onClick={() => handlePlayTTS(itemId, displayTitle)}
                            disabled={isLoadingThis}
                            className={`flex items-center justify-center p-1 rounded transition-colors ${
                              isPlayingThis
                                ? "bg-blue-500 text-white"
                                : "hover:bg-gray-200 text-gray-600"
                            } disabled:opacity-50`}
                            title={isPlayingThis ? "Stop" : "Play with TTS"}
                          >
                            <SpeakerLoudIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className={`whitespace-pre-wrap ${messageStyle}`}>
                        <ReactMarkdown>{displayTitle}</ReactMarkdown>
                      </div>
                    </div>
                    {guardrailResult && (
                      <div className="bg-gray-200 px-3 py-2 rounded-b-xl">
                        <GuardrailChip guardrailResult={guardrailResult} />
                      </div>
                    )}
                  </div>
                </div>
              );
            } else if (type === "BREADCRUMB") {
              return (
                <div
                  key={itemId}
                  className="flex flex-col justify-start items-start text-gray-500 text-sm"
                >
                  <span className="text-xs font-mono">{timestamp}</span>
                  <div
                    className={`whitespace-pre-wrap flex items-center font-mono text-sm text-gray-800 ${
                      data ? "cursor-pointer" : ""
                    }`}
                    onClick={() => data && toggleTranscriptItemExpand(itemId)}
                  >
                    {data && (
                      <span
                        className={`text-gray-400 mr-1 transform transition-transform duration-200 select-none font-mono ${
                          expanded ? "rotate-90" : "rotate-0"
                        }`}
                      >
                        ▶
                      </span>
                    )}
                    {title}
                  </div>
                  {expanded && data && (
                    <div className="text-gray-800 text-left">
                      <pre className="border-l-2 ml-1 border-gray-200 whitespace-pre-wrap break-words font-mono text-xs mb-2 mt-2 pl-2">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            } else {
              // Fallback if type is neither MESSAGE nor BREADCRUMB
              return (
                <div
                  key={itemId}
                  className="flex justify-center text-gray-500 text-sm italic font-mono"
                >
                  Unknown item type: {type}{" "}
                  <span className="ml-2 text-xs">{timestamp}</span>
                </div>
              );
            }
          })}
        </div>
      </div>

      <div className="p-4 flex items-center gap-x-2 flex-shrink-0 border-t border-gray-200">
        <button
          onClick={isASRRecording ? stopASR : startASR}
          disabled={chatOnly || !callSession.isMicEnabled}
          className={`p-2 rounded-full flex items-center justify-center transition-colors ${
            chatOnly || !callSession.isMicEnabled
              ? "bg-gray-300 text-gray-400 cursor-not-allowed"  // Disabled - chờ greeting
              : callSession.isTTSPlaying
                ? "bg-yellow-500 text-white"  // Buffering - TTS đang phát
                : isASRRecording 
                  ? "bg-red-500 text-white animate-pulse"  // Active - đang ghi
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"  // Idle
          }`}
          title={
            chatOnly
              ? "Chat-only mode (ASR disabled)"
              : !callSession.isMicEnabled 
              ? "Waiting for bot greeting..." 
              : callSession.isTTSPlaying
                ? "Buffering (TTS playing)"
                : isASRRecording 
                  ? "Stop Recording" 
                  : "Start Recording (ASR)"
          }
        >
          {isASRRecording ? <StopIcon /> : <MicrophoneIcon />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend) {
              onSendMessage();
            }
          }}
          className="flex-1 px-4 py-2 focus:outline-none"
          placeholder="Type a message..."
        />
        <button
          onClick={() => onSendMessage()}
          disabled={!canSend || !userText.trim()}
          className="bg-gray-900 text-white rounded-full px-2 py-2 disabled:opacity-50"
        >
          <Image src="arrow.svg" alt="Send" width={24} height={24} />
        </button>
      </div>
    </div>
  );
}

export default Transcript;
