import { useCallback, useRef, useState, useEffect } from 'react';
import {
  RealtimeSession,
  RealtimeAgent,
  OpenAIRealtimeWebRTC,
} from '@openai/agents/realtime';

import { applyCodecPreferences } from '../lib/codecUtils';
import { useEvent } from '../contexts/EventContext';
import { useHandleSessionHistory } from './useHandleSessionHistory';
import { SessionStatus } from '../types';

export interface RealtimeSessionCallbacks {
  onConnectionChange?: (status: SessionStatus) => void;
  onAgentHandoff?: (agentName: string) => void;
}

export interface ConnectOptions {
  getEphemeralKey: () => Promise<string>;
  initialAgents: RealtimeAgent[];
  audioElement?: HTMLAudioElement;
  extraContext?: Record<string, any>;
  outputGuardrails?: any[];
  isTextOnly?: boolean;
  disableMicInput?: boolean;
}

export function useRealtimeSession(callbacks: RealtimeSessionCallbacks = {}) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const listenersBoundSessionRef = useRef<RealtimeSession | null>(null);
  const silentAudioContextRef = useRef<AudioContext | null>(null);
  const silentTrackRef = useRef<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState<
    SessionStatus
  >('DISCONNECTED');
  const { logClientEvent, logServerEvent } = useEvent();
  const callbacksRef = useRef(callbacks);
  const logClientEventRef = useRef(logClientEvent);
  const logServerEventRef = useRef(logServerEvent);
  callbacksRef.current = callbacks;
  logClientEventRef.current = logClientEvent;
  logServerEventRef.current = logServerEvent;

  const cleanupSilentInput = useCallback(() => {
    silentTrackRef.current?.stop();
    silentTrackRef.current = null;
    if (silentAudioContextRef.current) {
      silentAudioContextRef.current.close().catch(() => {});
      silentAudioContextRef.current = null;
    }
  }, []);

  const createSilentInputStream = useCallback((): MediaStream | undefined => {
    if (typeof window === 'undefined') return undefined;
    cleanupSilentInput();

    const audioContext = new window.AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const track = destination.stream.getAudioTracks()[0];

    if (!track) {
      audioContext.close().catch(() => {});
      return undefined;
    }

    silentAudioContextRef.current = audioContext;
    silentTrackRef.current = track;
    return destination.stream;
  }, [cleanupSilentInput]);

  const updateStatus = useCallback(
    (s: SessionStatus) => {
      setStatus(s);
      callbacksRef.current.onConnectionChange?.(s);
      logClientEventRef.current({}, s);
    },
    [],
  );

  const historyHandlers = useHandleSessionHistory().current;

  const handleTransportEvent = useCallback((event: any) => {
    // Handle additional server events that aren't managed by the session
    switch (event.type) {
      case "conversation.item.input_audio_transcription.completed": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.done": {
        historyHandlers.handleTranscriptionCompleted(event);
        break;
      }
      case "response.audio_transcript.delta": {
        historyHandlers.handleTranscriptionDelta(event);
        break;
      }
      default: {
        logServerEventRef.current(event);
        break;
      } 
    }
  }, [historyHandlers]);

  const codecParamRef = useRef<string>(
    (typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('codec') ?? 'opus')
      : 'opus')
      .toLowerCase(),
  );

  // Wrapper to pass current codec param.
  // This lets you use the codec selector in the UI to force narrow-band (8 kHz) codecs to
  // simulate how the voice agent sounds over a PSTN/SIP phone call.
  const applyCodec = useCallback(
    (pc: RTCPeerConnection) => applyCodecPreferences(pc, codecParamRef.current),
    [],
  );

  const handleAgentHandoff = useCallback((item: any) => {
    const history = item.context.history;
    const lastMessage = history[history.length - 1];
    const agentName = lastMessage.name.split("transfer_to_")[1];
    callbacksRef.current.onAgentHandoff?.(agentName);
    // Mirror to server terminal for debugging.
    try {
      fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'sdk',
          event: 'agent_handoff',
          agentName,
          data: { rawName: lastMessage?.name },
        }),
      }).catch(() => {});
    } catch {}
  }, []);

  const bindSessionListeners = useCallback((session: RealtimeSession) => {
    if (listenersBoundSessionRef.current === session) return;
    listenersBoundSessionRef.current = session;

    const onError = (...args: any[]) => {
      logServerEventRef.current({
        type: "error",
        message: args[0],
      });
    };

    session.on("error", onError);
    session.on("agent_handoff", handleAgentHandoff);
    session.on("agent_tool_start", historyHandlers.handleAgentToolStart);
    session.on("agent_tool_end", historyHandlers.handleAgentToolEnd);
    session.on("history_updated", historyHandlers.handleHistoryUpdated);
    session.on("history_added", historyHandlers.handleHistoryAdded);
    session.on("guardrail_tripped", historyHandlers.handleGuardrailTripped);
    session.on("transport_event", handleTransportEvent);
  }, [handleAgentHandoff, handleTransportEvent, historyHandlers]);

  const connect = useCallback(
    async ({
      getEphemeralKey,
      initialAgents,
      audioElement,
      extraContext,
      outputGuardrails,
      isTextOnly = false,
      disableMicInput = false,
    }: ConnectOptions) => {
      if (sessionRef.current) return; // already connected

      updateStatus('CONNECTING');

      const ek = await getEphemeralKey();
      const rootAgent = initialAgents[0];

      const transportOptions: any = {
        audioElement,
        // Set preferred codec before offer creation
        changePeerConnection: async (pc: RTCPeerConnection) => {
          applyCodec(pc);
          return pc;
        },
      };
      if (disableMicInput && typeof window !== 'undefined') {
        // Provide a valid silent track so WebRTC never opens the mic
        // but still receives a real MediaStreamTrack instance.
        transportOptions.mediaStream = createSilentInputStream();
      }

      sessionRef.current = new RealtimeSession(rootAgent, {
        transport: new OpenAIRealtimeWebRTC(transportOptions),
        model: process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini-realtime-preview',
        config: {
          modalities: isTextOnly ? ['text'] : ['text'],
          // Important: we intentionally DON'T set turnDetection here.
          // App-level `session.update` will enable turn detection when needed.
        },
        outputGuardrails: outputGuardrails ?? [],
        context: extraContext ?? {},
      });
      bindSessionListeners(sessionRef.current);

      try {
        await sessionRef.current.connect({ apiKey: ek });
        updateStatus('CONNECTED');
      } catch (error) {
        sessionRef.current?.close();
        sessionRef.current = null;
        listenersBoundSessionRef.current = null;
        cleanupSilentInput();
        throw error;
      }
    },
    [bindSessionListeners, cleanupSilentInput, createSilentInputStream, updateStatus],
  );

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    listenersBoundSessionRef.current = null;
    cleanupSilentInput();
    updateStatus('DISCONNECTED');
  }, [cleanupSilentInput, updateStatus]);

  /* ----------------------- message helpers ------------------------- */

  const interrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);
  
  const sendUserText = useCallback((text: string) => {
    if (!sessionRef.current) {
      console.warn('RealtimeSession not connected; skip sendUserText');
      return;
    }
    sessionRef.current.sendMessage(text);
  }, []);

  const sendEvent = useCallback((ev: any) => {
    sessionRef.current?.transport.sendEvent(ev);
  }, []);

  const mute = useCallback((m: boolean) => {
    sessionRef.current?.mute(m);
  }, []);

  const pushToTalkStart = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }, []);

  const pushToTalkStop = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    sessionRef.current.transport.sendEvent({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    } as any);
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    mute,
    pushToTalkStart,
    pushToTalkStop,
    interrupt,
  } as const;
}
