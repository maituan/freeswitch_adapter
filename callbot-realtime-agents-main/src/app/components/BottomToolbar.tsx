import React from "react";
import { SessionStatus } from "@/app/types";

interface BottomToolbarProps {
  sessionStatus: SessionStatus;
  onToggleConnection: () => void;
  isPTTActive: boolean;
  setIsPTTActive: (val: boolean) => void;
  isPTTUserSpeaking: boolean;
  handleTalkButtonDown: () => void;
  handleTalkButtonUp: () => void;
  isEventsPaneExpanded: boolean;
  setIsEventsPaneExpanded: (val: boolean) => void;
  isAudioPlaybackEnabled: boolean;
  setIsAudioPlaybackEnabled: (val: boolean) => void;
  isAutoPlayTTSEnabled: boolean;
  setIsAutoPlayTTSEnabled: (val: boolean) => void;
  ttsVoiceId: string;
  setTtsVoiceId: (val: string) => void;
  voices: string[];
  codec: string;
  onCodecChange: (newCodec: string) => void;
  isTextOnly?: boolean;
}

function BottomToolbar({
  sessionStatus,
  onToggleConnection,
  isPTTActive,
  setIsPTTActive,
  isPTTUserSpeaking,
  handleTalkButtonDown,
  handleTalkButtonUp,
  isEventsPaneExpanded,
  setIsEventsPaneExpanded,
  isAudioPlaybackEnabled,
  setIsAudioPlaybackEnabled,
  isAutoPlayTTSEnabled,
  setIsAutoPlayTTSEnabled,
  ttsVoiceId,
  setTtsVoiceId,
  voices,
  codec,
  onCodecChange,
  isTextOnly = false,
}: BottomToolbarProps) {
  const isConnected = sessionStatus === "CONNECTED";
  const isConnecting = sessionStatus === "CONNECTING";

  const handleCodecChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCodec = e.target.value;
    onCodecChange(newCodec);
  };

  function getConnectionButtonLabel() {
    if (isConnected) return "Disconnect";
    if (isConnecting) return "Connecting...";
    return "Connect";
  }

  function getConnectionButtonClasses() {
    const baseClasses = "text-white text-base p-2 w-36 rounded-md h-full";
    const cursorClass = isConnecting ? "cursor-not-allowed" : "cursor-pointer";

    if (isConnected) {
      // Connected -> label "Disconnect" -> red
      return `bg-red-600 hover:bg-red-700 ${cursorClass} ${baseClasses}`;
    }
    // Disconnected or connecting -> label is either "Connect" or "Connecting" -> black
    return `bg-black hover:bg-gray-900 ${cursorClass} ${baseClasses}`;
  }

  return (
    <div className="p-4 flex flex-row items-center justify-center gap-x-8">
      <button
        onClick={onToggleConnection}
        className={getConnectionButtonClasses()}
        disabled={isConnecting}
      >
        {getConnectionButtonLabel()}
      </button>

      {!isTextOnly && (
        <div className="flex flex-row items-center gap-2">
          <input
            id="push-to-talk"
            type="checkbox"
            checked={isPTTActive}
            onChange={(e) => setIsPTTActive(e.target.checked)}
            disabled={!isConnected}
            className="w-4 h-4"
          />
          <label
            htmlFor="push-to-talk"
            className="flex items-center cursor-pointer"
          >
            Push to talk
          </label>
          <button
            onMouseDown={handleTalkButtonDown}
            onMouseUp={handleTalkButtonUp}
            onTouchStart={handleTalkButtonDown}
            onTouchEnd={handleTalkButtonUp}
            disabled={!isPTTActive}
            className={
              (isPTTUserSpeaking ? "bg-gray-300" : "bg-gray-200") +
              " py-1 px-4 cursor-pointer rounded-md" +
              (!isPTTActive ? " bg-gray-100 text-gray-400" : "")
            }
          >
            Talk
          </button>
        </div>
      )}

      {!isTextOnly && (
        <div className="flex flex-row items-center gap-1">
          <input
            id="audio-playback"
            type="checkbox"
            checked={isAudioPlaybackEnabled}
            onChange={(e) => setIsAudioPlaybackEnabled(e.target.checked)}
            disabled={!isConnected}
            className="w-4 h-4"
          />
          <label
            htmlFor="audio-playback"
            className="flex items-center cursor-pointer"
          >
            Audio playback
          </label>
        </div>
      )}

      <div className="flex flex-row items-center gap-2">
        <input
          id="auto-play-tts"
          type="checkbox"
          checked={isAutoPlayTTSEnabled}
          onChange={(e) => setIsAutoPlayTTSEnabled(e.target.checked)}
          disabled={!isConnected}
          className="w-4 h-4"
        />
        <label
          htmlFor="auto-play-tts"
          className="flex items-center cursor-pointer"
        >
          Auto-play TTS
        </label>
      </div>

      {voices.length > 0 && (
        <div className="flex flex-row items-center gap-2">
          <label htmlFor="tts-voice-select" className="flex items-center">
            TTS voice
          </label>
          <select
            id="tts-voice-select"
            value={ttsVoiceId}
            onChange={(e) => setTtsVoiceId(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none cursor-pointer"
          >
            {voices.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-row items-center gap-2">
        <input
          id="logs"
          type="checkbox"
          checked={isEventsPaneExpanded}
          onChange={(e) => setIsEventsPaneExpanded(e.target.checked)}
          className="w-4 h-4"
        />
        <label htmlFor="logs" className="flex items-center cursor-pointer">
          Logs
        </label>
      </div>

      {!isTextOnly && (
        <div className="flex flex-row items-center gap-2">
          <div>Codec:</div>
          {/*
            Codec selector – Lets you force the WebRTC track to use 8 kHz 
            PCMU/PCMA so you can preview how the agent will sound 
            (and how ASR/VAD will perform) when accessed via a 
            phone network.  Selecting a codec reloads the page with ?codec=...
            which our App-level logic picks up and applies via a WebRTC monkey
            patch (see codecPatch.ts).
          */}
          <select
            id="codec-select"
            value={codec}
            onChange={handleCodecChange}
            className="border border-gray-300 rounded-md px-2 py-1 focus:outline-none cursor-pointer"
          >
            <option value="opus">Opus (48 kHz)</option>
            <option value="pcmu">PCMU (8 kHz)</option>
            <option value="pcma">PCMA (8 kHz)</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default BottomToolbar;
