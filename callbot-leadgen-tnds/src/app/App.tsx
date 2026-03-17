"use client";
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import Image from "next/image";

// UI components
import Transcript from "./components/Transcript";
import Events from "./components/Events";
import BottomToolbar from "./components/BottomToolbar";
import UsageStats from "./components/UsageStats";

// Types
import { SessionStatus } from "@/app/types";
import type { RealtimeAgent } from '@openai/agents/realtime';

// Context providers & hooks
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRealtimeSession } from "./hooks/useRealtimeSession";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { leadgenV1Scenario, setLeadgenV1RuntimeContext } from "@/app/agentConfigs/leadgenV1";
import { setLeadgenMultiAgentRuntimeContext } from "@/app/agentConfigs/leadgenMultiAgent";
import { DEFAULT_TTS_VOICE_ID } from "@/app/lib/ttsVoices";

// Map used by connect logic for scenarios defined via the SDK.
const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  leadgenV1: leadgenV1Scenario,
  leadgenMultiAgent: allAgentSets['leadgenMultiAgent'],
};

import useAudioDownload from "./hooks/useAudioDownload";
import { useHandleSessionHistory } from "./hooks/useHandleSessionHistory";
import { useTTS } from "./hooks/useTTS";

function App() {
  const searchParams = useSearchParams()!;

  // ---------------------------------------------------------------------
  // Codec selector – lets you toggle between wide-band Opus (48 kHz)
  // and narrow-band PCMU/PCMA (8 kHz) to hear what the agent sounds like on
  // a traditional phone line and to validate ASR / VAD behaviour under that
  // constraint.
  //
  // We read the `?codec=` query-param and rely on the `changePeerConnection`
  // hook (configured in `useRealtimeSession`) to set the preferred codec
  // before the offer/answer negotiation.
  // ---------------------------------------------------------------------
  const urlCodec = searchParams.get("codec") || "opus";

  // Agents SDK doesn't currently support codec selection so it is now forced 
  // via global codecPatch at module load 

  const {
    addTranscriptMessage,
    addTranscriptBreadcrumb,
  } = useTranscript();
  const { logClientEvent, logServerEvent } = useEvent();

  const [selectedAgentName, setSelectedAgentName] = useState<string>("");
  const [selectedAgentConfigSet, setSelectedAgentConfigSet] = useState<
    RealtimeAgent[] | null
  >(null);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  // Ref to identify whether the latest agent switch came from an automatic handoff
  const handoffTriggeredRef = useRef(false);

  // Keep a muted sink element so WebRTC transport cannot emit audible output.
  const sdkAudioElement = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.muted = true;
    el.volume = 0;
    return el;
  }, []);

  const {
    connect,
    disconnect,
    sendUserText,
    sendEvent,
    interrupt,
    mute,
  } = useRealtimeSession({
    onConnectionChange: (s) => setSessionStatus(s as SessionStatus),
    onAgentHandoff: (agentName: string) => {
      handoffTriggeredRef.current = true;
      setSelectedAgentName(agentName);
      // Persist last agent for this call session
      if (callSessionId) {
        fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentConfig: agentSetKey,
            sessionId: callSessionId,
            lastAgentName: agentName,
          }),
        }).catch(() => {});
      }
    },
  });

  const [sessionStatus, setSessionStatus] =
    useState<SessionStatus>("DISCONNECTED");

  const [isEventsPaneExpanded, setIsEventsPaneExpanded] =
    useState<boolean>(true);
  const [userText, setUserText] = useState<string>("");
  const [isPTTActive, setIsPTTActive] = useState<boolean>(true); // Default PTT to true to prevent VAD hallucination on startup
  const [isPTTUserSpeaking, setIsPTTUserSpeaking] = useState<boolean>(false);
  
  // Force text-only globally so assistant audio is always handled by custom TTS service.
  const agentSetKey = searchParams.get("agentConfig") || defaultAgentSetKey;
  const isTextOnly = true;
  const abicTestMode = "off";

  // Dev run id: changes on each `npm run dev` restart so state doesn't leak.
  const [devRunId, setDevRunId] = useState<string>('prod');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'development') {
      setDevRunId('prod');
      return;
    }
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const data = j as { startedAt?: string } | null;
        const v = data?.startedAt ?? '';
        setDevRunId(v || 'dev');
      })
      .catch(() => setDevRunId('dev'));
  }, []);

  // Stable call session id (persisted) used for Redis-backed state
  const callSessionId = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    // In dev, include devRunId so each dev-server restart gets a fresh session id.
    const suffix = process.env.NODE_ENV === 'development' ? `:${devRunId}` : '';
    const keyPrefix = `callSessionId:${agentSetKey}`;
    const key = `${keyPrefix}${suffix}`;

    // Best-effort: in dev, clear older keys for this scenario so we don't accidentally reuse them.
    if (process.env.NODE_ENV === 'development') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith(keyPrefix) && k !== key) localStorage.removeItem(k);
        }
      } catch {}
    }

    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = uuidv4();
    localStorage.setItem(key, id);
    return id;
  }, [agentSetKey, devRunId]);

  const [leadgenGender, setLeadgenGender] = useState<string>(() => searchParams.get('leadGender') || 'anh');
  const [leadgenName, setLeadgenName] = useState<string>(() => searchParams.get('leadName') || 'Thiết');
  const [leadgenPhoneNumber, setLeadgenPhoneNumber] = useState<string>(() => searchParams.get('phoneNumber') || '0912345678');
  const [leadgenAgentName, setLeadgenAgentName] = useState<string>(() => searchParams.get('agentName') || 'Thảo');
  const [leadgenPlate, setLeadgenPlate] = useState<string>(() => searchParams.get('leadPlate') || '29A-12345');
  const [leadgenAddress, setLeadgenAddress] = useState<string>(() => searchParams.get('address') || '');
  const [leadgenBrand, setLeadgenBrand] = useState<string>(() => searchParams.get('brand') || '');
  const [leadgenColor, setLeadgenColor] = useState<string>(() => searchParams.get('color') || '');
  const [leadgenVehicleType, setLeadgenVehicleType] = useState<string>(() => searchParams.get('vehicleType') || '');
  const [leadgenNumSeats, setLeadgenNumSeats] = useState<string>(() => searchParams.get('numSeats') || '');
  const [leadgenIsBusiness, setLeadgenIsBusiness] = useState<string>(() => searchParams.get('isBusiness') || '');
  const [leadgenWeightTons, setLeadgenWeightTons] = useState<string>(() => searchParams.get('weightTons') || '');
  const [leadgenExpiryDate, setLeadgenExpiryDate] = useState<string>(
    () => searchParams.get('expiryDate') || '15/05/2026',
  );

  const [carebotChatOnly, setCarebotChatOnly] = useState<boolean>(
    () => searchParams.get('chatOnly') === '1',
  );
  const isChatOnlyMode = carebotChatOnly;

  // Chat-only mode: keep VAD disabled and avoid ASR dependency.
  useEffect(() => {
    if (!isChatOnlyMode) return;
    setIsPTTActive(true);
    setIsPTTUserSpeaking(false);
  }, [isChatOnlyMode]);
  
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return !isTextOnly;
      const stored = localStorage.getItem('audioPlaybackEnabled');
      // Default to false for text-only mode, true otherwise
      return stored ? stored === 'true' : !isTextOnly;
    },
  );
  const [ttsVoiceId, setTtsVoiceId] = useState<string>(
    () => {
      if (typeof window === 'undefined') return DEFAULT_TTS_VOICE_ID;
      return localStorage.getItem('ttsVoiceId') || DEFAULT_TTS_VOICE_ID;
    },
  );

  const [isAutoPlayTTSEnabled, setIsAutoPlayTTSEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('autoPlayTTSEnabled');
      return stored ? stored === 'true' : true; // Default to true (auto-play)
    },
  );

  // Save auto-play TTS preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('autoPlayTTSEnabled', isAutoPlayTTSEnabled.toString());
    }
  }, [isAutoPlayTTSEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ttsVoiceId', ttsVoiceId);
    }
  }, [ttsVoiceId]);

  // Initialize TTS hook at App level để có thể capture stream cho recording
  const tts = useTTS();

  // Initialize the recording hook với TTS stream getter
  const { startRecording, stopRecording, downloadRecording } =
    useAudioDownload({ getTTSStream: tts.getTTSStream });

  const sendClientEvent = (eventObj: any, eventNameSuffix = "") => {
    try {
      sendEvent(eventObj);
      logClientEvent(eventObj, eventNameSuffix);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }
  };

  useHandleSessionHistory();

  useEffect(() => {
    if (agentSetKey !== 'leadgenV1' && agentSetKey !== 'leadgenMultiAgent') return;
    const parsedSeats = Number(leadgenNumSeats.trim());
    const parsedWeightTons = Number(leadgenWeightTons.trim());
    const runtimeOverrides = {
      sessionId: callSessionId || undefined,
      leadId: searchParams.get('leadId') || undefined,
      phoneNumber: leadgenPhoneNumber.trim() || undefined,
      displayAgentName: leadgenAgentName.trim() || undefined,
      overrideGender: leadgenGender.trim() || undefined,
      overrideName: leadgenName.trim() || undefined,
      overridePlate: leadgenPlate.trim() || undefined,
      overrideAddress: leadgenAddress.trim() || undefined,
      overrideBrand: leadgenBrand.trim() || undefined,
      overrideColor: leadgenColor.trim() || undefined,
      overrideVehicleType:
        (leadgenVehicleType.trim() as 'car' | 'pickup' | 'truck') || undefined,
      overrideNumSeats: Number.isFinite(parsedSeats) && parsedSeats > 0 ? parsedSeats : undefined,
      overrideIsBusiness:
        leadgenIsBusiness.trim() === 'true'
          ? true
          : leadgenIsBusiness.trim() === 'false'
            ? false
            : undefined,
      overrideWeightTons:
        Number.isFinite(parsedWeightTons) && parsedWeightTons > 0 ? parsedWeightTons : undefined,
      overrideExpiryDate: leadgenExpiryDate.trim() || undefined,
    };

    setLeadgenV1RuntimeContext(runtimeOverrides);
    setLeadgenMultiAgentRuntimeContext(runtimeOverrides);
  }, [
    agentSetKey,
    callSessionId,
    searchParams,
    leadgenGender,
    leadgenName,
    leadgenPhoneNumber,
    leadgenAgentName,
    leadgenPlate,
    leadgenAddress,
    leadgenBrand,
    leadgenColor,
    leadgenVehicleType,
    leadgenNumSeats,
    leadgenIsBusiness,
    leadgenWeightTons,
    leadgenExpiryDate,
  ]);

  useEffect(() => {
    let finalAgentConfig = searchParams.get("agentConfig");
    if (!finalAgentConfig || !allAgentSets[finalAgentConfig]) {
      finalAgentConfig = defaultAgentSetKey;
      const url = new URL(window.location.toString());
      url.searchParams.set("agentConfig", finalAgentConfig);
      window.location.replace(url.toString());
      return;
    }

    const agents = allAgentSets[finalAgentConfig];
    setSelectedAgentConfigSet(agents);

    const scenarioDefaultAgentName =
      finalAgentConfig === 'carebotAuto365' ? 'renewalReminderAgent' : agents[0]?.name || "";
    const defaultAgent = agents.some((a) => a.name === scenarioDefaultAgentName)
      ? scenarioDefaultAgentName
      : agents[0]?.name || "";

    // Leadgen and Carebot renewal should start from a fixed default agent on FE.
    if (
      finalAgentConfig === 'leadgenV1' ||
      finalAgentConfig === 'leadgenMultiAgent'
    ) {
      setSelectedAgentName(defaultAgent);
      return;
    }

    (async () => {
      try {
        if (!callSessionId) {
          setSelectedAgentName(defaultAgent);
          return;
        }
        const res = await fetch(
          `/api/state?agentConfig=${encodeURIComponent(finalAgentConfig!)}&sessionId=${encodeURIComponent(callSessionId)}`
        );
        if (!res.ok) {
          setSelectedAgentName(defaultAgent);
          return;
        }
        const data = (await res.json()) as { state?: { lastAgentName?: string } };
        const last = data?.state?.lastAgentName;
        const isValid = last && agents.some((a) => a.name === last);
        setSelectedAgentName(isValid ? last : defaultAgent);
      } catch {
        setSelectedAgentName(defaultAgent);
      }
    })();
  }, [searchParams, callSessionId]);

  useEffect(() => {
    if (selectedAgentName && sessionStatus === "DISCONNECTED") {
      connectToRealtime();
    }
  }, [selectedAgentName]);  

  useEffect(() => {
    if (
      sessionStatus === "CONNECTED" &&
      selectedAgentConfigSet &&
      selectedAgentName
    ) {
      const currentAgent = selectedAgentConfigSet.find(
        (a) => a.name === selectedAgentName
      );
      addTranscriptBreadcrumb(`Agent: ${selectedAgentName}`, currentAgent);
      const shouldTriggerResponse = !handoffTriggeredRef.current;
      const isAbicDocTest = agentSetKey === 'abicHotline' && abicTestMode !== 'off';
      updateSession(isAbicDocTest ? false : shouldTriggerResponse);
      // Reset flag after handling so subsequent effects behave normally
      handoffTriggeredRef.current = false;
    }
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus, agentSetKey, abicTestMode, isChatOnlyMode]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [isPTTActive, isChatOnlyMode]);

  const fetchEphemeralKey = async (): Promise<string | null> => {
    logClientEvent({ url: "/session" }, "fetch_session_token_request");
    const tokenResponse = await fetch("/api/session");
    const data = (await tokenResponse.json()) as Record<string, any>;
    logServerEvent(data, "fetch_session_token_response");

    if (!data.client_secret?.value) {
      logClientEvent(data, "error.no_ephemeral_key");
      console.error("No ephemeral key provided by the server");
      setSessionStatus("DISCONNECTED");
      return null;
    }

    return data.client_secret.value;
  };

  const connectToRealtime = async (chatOnlyOverride = isChatOnlyMode) => {
    const agentSetKey = searchParams.get("agentConfig") || "default";
    if (sdkScenarioMap[agentSetKey]) {
      if (sessionStatus !== "DISCONNECTED") return;
      setSessionStatus("CONNECTING");

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...sdkScenarioMap[agentSetKey]];
        const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        // Force text-only globally to disable OpenAI Realtime TTS.
        const isTextOnlyMode = true;
        
        // Guardrails:
        // - Moderation for some scenarios
        // - Tool-required for ABIC travel agent to enforce deterministic policy tool usage
        const guardrails: any[] = [];
        // NOTE: Avoid output guardrails for abicHotline to prevent response loops.

        await connect({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          audioElement: sdkAudioElement,
          outputGuardrails: guardrails,
          extraContext: {
            addTranscriptBreadcrumb,
          },
          isTextOnly: isTextOnlyMode,
          disableMicInput: chatOnlyOverride,
        });
        if (isTextOnlyMode) {
          mute(true);
        }
      } catch (err) {
        console.error("Error connecting via SDK:", err);
        setSessionStatus("DISCONNECTED");
      }
      return;
    }
  };

  const disconnectFromRealtime = () => {
    disconnect();
    setSessionStatus("DISCONNECTED");
    setIsPTTUserSpeaking(false);
  };

  function forceSelectAgent(agentName: string) {
    disconnectFromRealtime();
    setSelectedAgentName(agentName);
    if (callSessionId) {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentConfig: agentSetKey,
          sessionId: callSessionId,
          lastAgentName: agentName,
        }),
      }).catch(() => {});
    }
  }

  // Debug helper: force ABIC travel into step 3 for knowledge testing
  useEffect(() => {
    if (!callSessionId) return;
    if (agentSetKey !== 'abicHotline') return;
    if (!abicTestMode || abicTestMode === 'off') return;

    const travelType =
      abicTestMode === 'domestic' ? 'TRAVEL_DOMESTIC' : 'TRAVEL_INTERNATIONAL';
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentConfig: agentSetKey,
        sessionId: callSessionId,
        lastAgentName: 'abicTravelAgent',
        data: { abicTravel: { travelType, offeredWeb: true } },
      }),
    }).catch(() => {});
    forceSelectAgent('abicTravelAgent');
  }, [agentSetKey, callSessionId, abicTestMode]);

  const sendSimulatedUserMessage = (text: string) => {
    const id = uuidv4().slice(0, 32);
    addTranscriptMessage(id, "user", text, true);

    sendClientEvent({
      type: 'conversation.item.create',
      item: {
        id,
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    sendClientEvent(
      {
        type: 'response.create',
        response: {
          modalities: ['text'],
        },
      },
      '(simulated user text message)',
    );
  };

  const updateSession = (shouldTriggerResponse: boolean = false) => {
    // Reflect Push-to-Talk UI state by (de)activating server VAD on the
    // backend. The Realtime SDK supports live session updates via the
    // `session.update` event.
    const turnDetection = isChatOnlyMode || isPTTActive
      ? null
      : {
          type: 'server_vad',
          threshold: 0.9,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        };

    sendEvent({
      type: 'session.update',
      session: {
        modalities: ['text'],
        turn_detection: turnDetection,
      },
    });

    // Send an initial 'hi' message to trigger the agent to greet the user
    if (shouldTriggerResponse) {
      sendSimulatedUserMessage('hi');
    }
    return;
  }

  const handleSendTextMessage = (overrideText?: string) => {
    const textToSend = (typeof overrideText === "string" ? overrideText : userText).trim();
    if (!textToSend) return;
    if (sessionStatus !== "CONNECTED") {
      console.warn("Skip sendUserText because session is not connected");
      return;
    }

    interrupt();

    try {
      sendUserText(textToSend);
    } catch (err) {
      console.error('Failed to send via SDK', err);
    }

    setUserText("");
  };

  const handleTalkButtonDown = () => {
    if (isChatOnlyMode) return;
    if (sessionStatus !== 'CONNECTED') return;
    interrupt();

    setIsPTTUserSpeaking(true);
    sendClientEvent({ type: 'input_audio_buffer.clear' }, 'clear PTT buffer');

    // No placeholder; we'll rely on server transcript once ready.
  };

  const handleTalkButtonUp = () => {
    if (isChatOnlyMode) return;
    if (sessionStatus !== 'CONNECTED' || !isPTTUserSpeaking)
      return;

    setIsPTTUserSpeaking(false);
    sendClientEvent({ type: 'input_audio_buffer.commit' }, 'commit PTT');
    sendClientEvent(
      {
        type: 'response.create',
        response: {
          modalities: ['text'],
        },
      },
      'trigger response PTT',
    );
  };

  const onToggleConnection = () => {
    if (sessionStatus === "CONNECTED" || sessionStatus === "CONNECTING") {
      disconnectFromRealtime();
      setSessionStatus("DISCONNECTED");
    } else {
      connectToRealtime();
    }
  };

  const handleAgentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentConfig = e.target.value;
    const url = new URL(window.location.toString());
    url.searchParams.set("agentConfig", newAgentConfig);
    window.location.replace(url.toString());
  };

  const handleSelectedAgentChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newAgentName = e.target.value;
    // Reconnect session with the newly selected agent as root so that tool
    // execution works correctly.
    disconnectFromRealtime();
    setSelectedAgentName(newAgentName);
    // Persist manual selection as last agent
    if (callSessionId) {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentConfig: agentSetKey,
          sessionId: callSessionId,
          lastAgentName: newAgentName,
        }),
      }).catch(() => {});
    }
    // connectToRealtime will be triggered by effect watching selectedAgentName
  };

  const handleChatOnlyToggle = (checked: boolean) => {
    setCarebotChatOnly(checked);

    const url = new URL(window.location.toString());
    if (checked) url.searchParams.set('chatOnly', '1');
    else url.searchParams.delete('chatOnly');
    window.history.replaceState({}, '', url.toString());

    if (sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING') {
      disconnectFromRealtime();
      setSessionStatus('DISCONNECTED');
      setTimeout(() => {
        connectToRealtime(checked);
      }, 150);
    }
  };

  const handleApplyLeadgenOverrides = () => {
    const url = new URL(window.location.toString());
    const updates: Array<[string, string]> = [
      ['leadGender', leadgenGender.trim()],
      ['leadName', leadgenName.trim()],
      ['phoneNumber', leadgenPhoneNumber.trim()],
      ['agentName', leadgenAgentName.trim()],
      ['leadPlate', leadgenPlate.trim()],
      ['address', leadgenAddress.trim()],
      ['brand', leadgenBrand.trim()],
      ['color', leadgenColor.trim()],
      ['vehicleType', leadgenVehicleType.trim()],
      ['numSeats', leadgenNumSeats.trim()],
      ['isBusiness', leadgenIsBusiness.trim()],
      ['weightTons', leadgenWeightTons.trim()],
      ['expiryDate', leadgenExpiryDate.trim()],
      ['chatOnly', carebotChatOnly ? '1' : ''],
    ];
    for (const [key, value] of updates) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState({}, '', url.toString());

    if (sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING') {
      disconnectFromRealtime();
      setSessionStatus('DISCONNECTED');
      setTimeout(() => {
        connectToRealtime();
      }, 150);
    }
  };

  // Because we need a new connection, refresh the page when codec changes
  const handleCodecChange = (newCodec: string) => {
    const url = new URL(window.location.toString());
    url.searchParams.set("codec", newCodec);
    window.location.replace(url.toString());
  };

  useEffect(() => {
    const storedPushToTalkUI = localStorage.getItem("pushToTalkUI");
    if (!isChatOnlyMode && storedPushToTalkUI) {
      setIsPTTActive(storedPushToTalkUI === "true");
    }
    const storedLogsExpanded = localStorage.getItem("logsExpanded");
    if (storedLogsExpanded) {
      setIsEventsPaneExpanded(storedLogsExpanded === "true");
    }
    const storedAudioPlaybackEnabled = localStorage.getItem(
      "audioPlaybackEnabled"
    );
    if (storedAudioPlaybackEnabled) {
      setIsAudioPlaybackEnabled(storedAudioPlaybackEnabled === "true");
    }
  }, [isChatOnlyMode]);

  useEffect(() => {
    if (isChatOnlyMode) return;
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive, isChatOnlyMode]);

  useEffect(() => {
    localStorage.setItem("logsExpanded", isEventsPaneExpanded.toString());
  }, [isEventsPaneExpanded]);

  useEffect(() => {
    localStorage.setItem(
      "audioPlaybackEnabled",
      isAudioPlaybackEnabled.toString()
    );
  }, [isAudioPlaybackEnabled]);

  useEffect(() => {
    if (audioElementRef.current) {
      if (isAudioPlaybackEnabled) {
        audioElementRef.current.muted = false;
        audioElementRef.current.play().catch((err) => {
          console.warn("Autoplay may be blocked by browser:", err);
        });
      } else {
        // Mute and pause to avoid brief audio blips before pause takes effect.
        audioElementRef.current.muted = true;
        audioElementRef.current.pause();
      }
    }

    // Toggle server-side audio stream mute so bandwidth is saved when the
    // user disables playback. 
    try {
      mute(!isAudioPlaybackEnabled);
    } catch (err) {
      console.warn('Failed to toggle SDK mute', err);
    }
  }, [isAudioPlaybackEnabled]);

  // Ensure mute state is propagated to transport right after we connect or
  // whenever the SDK client reference becomes available.
  useEffect(() => {
    if (sessionStatus === 'CONNECTED') {
      try {
        mute(!isAudioPlaybackEnabled);
      } catch (err) {
        console.warn('mute sync after connect failed', err);
      }
    }
  }, [sessionStatus, isAudioPlaybackEnabled]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      // Start recording - remoteStream is optional (may not exist in TTS-only mode)
      const remoteStream = audioElementRef.current?.srcObject as MediaStream | undefined;
      startRecording(remoteStream);
      console.log("[App] Recording started", remoteStream ? "with remote stream" : "TTS-only mode");
    }

    // Clean up on unmount or when sessionStatus is updated.
    return () => {
      stopRecording();
    };
  }, [sessionStatus]);

  return (
    <div className="text-base flex flex-col h-screen bg-gray-100 text-gray-800 relative">
      <div className="p-5 text-lg font-semibold flex justify-between items-center">
        <div
          className="flex items-center cursor-pointer"
          onClick={() => window.location.reload()}
        >
          <div>
            <Image
              src="/openai-logomark.svg"
              alt="OpenAI Logo"
              width={20}
              height={20}
              className="mr-2"
            />
          </div>
          <div>
            Realtime API <span className="text-gray-500">Agents</span>
          </div>
        </div>
        <div className="flex items-center">
          <label className="flex items-center text-base gap-1 mr-2 font-medium">
            Scenario
          </label>
          <div className="relative inline-block">
            <select
              value={agentSetKey}
              onChange={handleAgentChange}
              className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
            >
              {Object.keys(allAgentSets).map((agentKey) => (
                <option key={agentKey} value={agentKey}>
                  {agentKey}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>

          {agentSetKey && (
            <div className="flex items-center ml-6">
              <label className="flex items-center text-base gap-1 mr-2 font-medium">
                Agent
              </label>
              <div className="relative inline-block">
                <select
                  value={selectedAgentName}
                  onChange={handleSelectedAgentChange}
                  className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
                >
                  {selectedAgentConfigSet?.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-600">
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 10.44l3.71-3.21a.75.75 0 111.04 1.08l-4.25 3.65a.75.75 0 01-1.04 0L5.21 8.27a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 ml-6 text-sm font-normal text-gray-700">
            <input
              type="checkbox"
              checked={carebotChatOnly}
              onChange={(e) => handleChatOnlyToggle(e.target.checked)}
              className="h-4 w-4"
            />
            Chat only (không dùng ASR)
          </label>
        </div>
      </div>

      {/* Leadgen Settings (V1 and Multi-Agent) */}
      {(agentSetKey === 'leadgenV1' || agentSetKey === 'leadgenMultiAgent') && (
        <div className="px-5 pb-2 flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Xưng hô</label>
            <input
              value={leadgenGender}
              onChange={(e) => setLeadgenGender(e.target.value)}
              placeholder="Anh / Chị"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên khách</label>
            <input
              value={leadgenName}
              onChange={(e) => setLeadgenName(e.target.value)}
              placeholder="Bảo"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">SĐT</label>
            <input
              value={leadgenPhoneNumber}
              onChange={(e) => setLeadgenPhoneNumber(e.target.value)}
              placeholder="09..."
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên agent</label>
            <input
              value={leadgenAgentName}
              onChange={(e) => setLeadgenAgentName(e.target.value)}
              placeholder="Thảo"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Biển số</label>
            <input
              value={leadgenPlate}
              onChange={(e) => setLeadgenPlate(e.target.value)}
              placeholder="29A-86256"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Địa chỉ</label>
            <input
              value={leadgenAddress}
              onChange={(e) => setLeadgenAddress(e.target.value)}
              placeholder="12 Nguyễn Trãi, Hà Nội"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-48"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Hãng xe</label>
            <input
              value={leadgenBrand}
              onChange={(e) => setLeadgenBrand(e.target.value)}
              placeholder="Toyota"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Màu xe</label>
            <input
              value={leadgenColor}
              onChange={(e) => setLeadgenColor(e.target.value)}
              placeholder="Trắng"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Loại xe</label>
            <select
              value={leadgenVehicleType}
              onChange={(e) => setLeadgenVehicleType(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            >
              <option value="">Chưa chọn</option>
              <option value="car">Xe con</option>
              <option value="pickup">Bán tải</option>
              <option value="truck">Xe tải</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Số chỗ</label>
            <input
              value={leadgenNumSeats}
              onChange={(e) => setLeadgenNumSeats(e.target.value)}
              placeholder="5"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Kinh doanh</label>
            <select
              value={leadgenIsBusiness}
              onChange={(e) => setLeadgenIsBusiness(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            >
              <option value="">Chưa rõ</option>
              <option value="false">Không</option>
              <option value="true">Có</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Trọng tải</label>
            <input
              value={leadgenWeightTons}
              onChange={(e) => setLeadgenWeightTons(e.target.value)}
              placeholder="1.5"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Hết hạn</label>
            <input
              value={leadgenExpiryDate}
              onChange={(e) => setLeadgenExpiryDate(e.target.value)}
              placeholder="15/05/2026"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <button
            onClick={handleApplyLeadgenOverrides}
            className="border border-gray-300 rounded-lg text-sm px-3 py-1 bg-white hover:bg-gray-50"
          >
            Áp dụng
          </button>
        </div>
      )}

      <div className="flex flex-1 gap-2 px-2 overflow-hidden relative">
        <Transcript
          userText={userText}
          setUserText={setUserText}
          onSendMessage={handleSendTextMessage}
          downloadRecording={downloadRecording}
          canSend={
            sessionStatus === "CONNECTED"
          }
          autoPlayTTS={isAutoPlayTTSEnabled}
          // Force streaming mode to avoid offline fetch timeouts
          ttsMode={"streaming"}
          ttsVoiceId={ttsVoiceId}
          tts={tts}
          agentSetKey={agentSetKey}
          chatOnly={isChatOnlyMode}
          onEndCall={() => {
            console.log('[App] ENDCALL received, disconnecting...');
            disconnectFromRealtime();
          }}
        />

        <Events isExpanded={isEventsPaneExpanded} />
      </div>

      <BottomToolbar
        sessionStatus={sessionStatus}
        onToggleConnection={onToggleConnection}
        isPTTActive={isPTTActive}
        setIsPTTActive={setIsPTTActive}
        isPTTUserSpeaking={isPTTUserSpeaking}
        handleTalkButtonDown={handleTalkButtonDown}
        handleTalkButtonUp={handleTalkButtonUp}
        isEventsPaneExpanded={isEventsPaneExpanded}
        setIsEventsPaneExpanded={setIsEventsPaneExpanded}
        isAudioPlaybackEnabled={isAudioPlaybackEnabled}
        setIsAudioPlaybackEnabled={setIsAudioPlaybackEnabled}
        isAutoPlayTTSEnabled={isAutoPlayTTSEnabled}
        setIsAutoPlayTTSEnabled={setIsAutoPlayTTSEnabled}
        ttsVoiceId={ttsVoiceId}
        setTtsVoiceId={setTtsVoiceId}
        codec={urlCodec}
        onCodecChange={handleCodecChange}
        isTextOnly={isTextOnly}
      />

      {/* Usage Stats - Token & Cost Tracking */}
      <UsageStats />
    </div>
  );
}

export default App;
