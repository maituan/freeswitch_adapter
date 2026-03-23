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
import {
  createLeadgenFaqToolRequiredGuardrail,
  createLeadgenOpeningGuardrail,
  createModerationGuardrail,
} from "@/app/agentConfigs/guardrails";

// Agent configs
import { allAgentSets, defaultAgentSetKey } from "@/app/agentConfigs";
import { customerServiceRetailScenario } from "@/app/agentConfigs/customerServiceRetail";
import { chatSupervisorScenario } from "@/app/agentConfigs/chatSupervisor";
import { customerServiceRetailCompanyName } from "@/app/agentConfigs/customerServiceRetail";
import { chatSupervisorCompanyName } from "@/app/agentConfigs/chatSupervisor";
import { simpleHandoffScenario } from "@/app/agentConfigs/simpleHandoff";
import { textOnlyScenario } from "@/app/agentConfigs/textOnly";
import { hotlineAIScenario } from "@/app/agentConfigs/hotlineAI";
import { motheAIScenario } from "@/app/agentConfigs/motheAI";
import { bidvBotScenario } from "@/app/agentConfigs/bidvBot";
import { abicHotlineScenario } from "@/app/agentConfigs/abicHotline";
import { leadgenTndsScenario } from "@/app/agentConfigs/leadgenTNDS";
import { createLeadgenRouterAgent } from "@/app/agentConfigs/leadgenTNDS/router/agent";
import { insuranceCarebotScenario } from "@/app/agentConfigs/insuranceCarebot";
import type { CampaignType, PreferredPronoun } from "@/app/agentConfigs/insuranceCarebot/core/contextSchema";
import { createRenewalReminderAgent } from "@/app/agentConfigs/insuranceCarebot/scenarios/renewalReminderAgent";
import { leadgenMultiAgentScenario, setLeadgenMultiAgentRuntimeContext } from "@/app/agentConfigs/leadgenMultiAgent";

// Map used by connect logic for scenarios defined via the SDK.
const sdkScenarioMap: Record<string, RealtimeAgent[]> = {
  simpleHandoff: simpleHandoffScenario,
  customerServiceRetail: customerServiceRetailScenario,
  chatSupervisor: chatSupervisorScenario,
  textOnly: textOnlyScenario,
  hotlineAI: hotlineAIScenario,
  motheAI: motheAIScenario,
  bidvBot: bidvBotScenario,
  abicHotline: abicHotlineScenario,
  leadgenTNDS: leadgenTndsScenario,
  carebotAuto365: insuranceCarebotScenario,
  leadgenMultiAgent: leadgenMultiAgentScenario,
};

const carebotCampaignTypes = new Set<CampaignType>([
  'renewal_reminder',
  'post_sale_safety',
  'post_sale_digital_card',
  'holiday_care',
  'activation_365',
  'monthly_checkin',
]);

const carebotPronouns = new Set<PreferredPronoun>(['anh', 'chi']);

const carebotFeDefaults = {
  campaignType: 'renewal_reminder',
  triggerReason: 'xe_sap_het_han_1_thang',
  customerId: 'CUST-0001',
  customerName: 'Minh',
  phoneNumber: '0901234567',
  preferredPronoun: 'anh',
  licensePlate: '51A-12345',
  expiryDate: '28/03/2026',
  baseFee: '535,000 đồng',
  discountPercent: '15',
  discountedFee: '455,000 đồng',
  discountInfo: 'Giảm 15% cho khách tái tục',
  agentName: 'Thảo',
  companyName: 'Bảo hiểm xe ô tô',
  hotlineNumber: '1800-1234',
} as const;

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


  const [abicTestMode, setAbicTestMode] = useState<string>(
    () => searchParams.get('abicTestB3') || 'international',
  );
  const [leadgenGender, setLeadgenGender] = useState<string>(
    () => searchParams.get('leadGender') || '',
  );
  const [leadgenName, setLeadgenName] = useState<string>(
    () => searchParams.get('leadName') || '',
  );
  const [leadgenPlate, setLeadgenPlate] = useState<string>(
    () => searchParams.get('leadPlate') || '',
  );

  // leadgenMultiAgent form state
  const [multiGender, setMultiGender] = useState<string>(() => searchParams.get('gender') || '');
  const [multiName, setMultiName] = useState<string>(() => searchParams.get('name') || '');
  const [multiPhone, setMultiPhone] = useState<string>(() => searchParams.get('phone') || '');
  const [multiAgentName, setMultiAgentName] = useState<string>(() => searchParams.get('agentName') || '');
  const [multiPlate, setMultiPlate] = useState<string>(() => searchParams.get('plate') || '');
  const [multiAddress, setMultiAddress] = useState<string>(() => searchParams.get('address') || '');
  const [multiBrand, setMultiBrand] = useState<string>(() => searchParams.get('brand') || '');
  const [multiColor, setMultiColor] = useState<string>(() => searchParams.get('color') || '');
  const [multiVehicleType, setMultiVehicleType] = useState<string>(() => searchParams.get('vehicleType') || '');
  const [multiNumSeats, setMultiNumSeats] = useState<string>(() => searchParams.get('numSeats') || '');
  const [multiIsBusiness, setMultiIsBusiness] = useState<string>(() => searchParams.get('isBusiness') || '');
  const [multiWeightTons, setMultiWeightTons] = useState<string>(() => searchParams.get('weightTons') || '');
  const [multiExpiryDate, setMultiExpiryDate] = useState<string>(() => searchParams.get('expiryDate') || '');
  const [carebotCampaignType, setCarebotCampaignType] = useState<string>(
    () => searchParams.get('campaignType') || carebotFeDefaults.campaignType,
  );
  const [carebotTriggerReason, setCarebotTriggerReason] = useState<string>(
    () => searchParams.get('triggerReason') || carebotFeDefaults.triggerReason,
  );
  const [carebotCustomerId, setCarebotCustomerId] = useState<string>(
    () => searchParams.get('customerId') || carebotFeDefaults.customerId,
  );
  const [carebotCustomerName, setCarebotCustomerName] = useState<string>(
    () => searchParams.get('customerName') || carebotFeDefaults.customerName,
  );
  const [carebotPhoneNumber, setCarebotPhoneNumber] = useState<string>(
    () => searchParams.get('phoneNumber') || carebotFeDefaults.phoneNumber,
  );
  const [carebotPronoun, setCarebotPronoun] = useState<string>(
    () => searchParams.get('preferredPronoun') || carebotFeDefaults.preferredPronoun,
  );
  const [carebotLicensePlate, setCarebotLicensePlate] = useState<string>(
    () => searchParams.get('licensePlate') || carebotFeDefaults.licensePlate,
  );
  const [carebotExpiryDate, setCarebotExpiryDate] = useState<string>(
    () => searchParams.get('expiryDate') || carebotFeDefaults.expiryDate,
  );
  const [carebotDiscountInfo, setCarebotDiscountInfo] = useState<string>(
    () => searchParams.get('discountInfo') || carebotFeDefaults.discountInfo,
  );
  const [carebotBaseFee, setCarebotBaseFee] = useState<string>(
    () => searchParams.get('baseFee') || carebotFeDefaults.baseFee,
  );
  const [carebotDiscountPercent, setCarebotDiscountPercent] = useState<string>(
    () => searchParams.get('discountPercent') || carebotFeDefaults.discountPercent,
  );
  const [carebotDiscountedFee, setCarebotDiscountedFee] = useState<string>(
    () => searchParams.get('discountedFee') || carebotFeDefaults.discountedFee,
  );
  const [carebotAgentName, setCarebotAgentName] = useState<string>(
    () => searchParams.get('agentName') || carebotFeDefaults.agentName,
  );
  const [carebotCompanyName, setCarebotCompanyName] = useState<string>(
    () => searchParams.get('companyName') || carebotFeDefaults.companyName,
  );
  const [carebotHotlineNumber, setCarebotHotlineNumber] = useState<string>(
    () => searchParams.get('hotlineNumber') || carebotFeDefaults.hotlineNumber,
  );
  const [carebotChatOnly, setCarebotChatOnly] = useState<boolean>(
    () => searchParams.get('chatOnly') === '1',
  );
  const isChatOnlyMode =
    (agentSetKey === 'carebotAuto365' || agentSetKey === 'leadgenTNDS' || agentSetKey === 'leadgenMultiAgent') && carebotChatOnly;
  useEffect(() => {
    if (agentSetKey !== 'abicHotline') return;
    if (!abicTestMode || abicTestMode === 'off') return;
    const current = searchParams.get('abicTestB3');
    if (current) return;
    const url = new URL(window.location.toString());
    url.searchParams.set('abicTestB3', abicTestMode);
    window.history.replaceState({}, '', url.toString());
  }, [agentSetKey, abicTestMode, searchParams]);

  // Chat-only mode: keep VAD disabled and avoid ASR dependency.
  useEffect(() => {
    if (!isChatOnlyMode) return;
    setIsPTTActive(true);
  }, [isChatOnlyMode]);
  
  const [isAudioPlaybackEnabled, setIsAudioPlaybackEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return !isTextOnly;
      const stored = localStorage.getItem('audioPlaybackEnabled');
      // Default to false for text-only mode, true otherwise
      return stored ? stored === 'true' : !isTextOnly;
    },
  );

  const [isAutoPlayTTSEnabled, setIsAutoPlayTTSEnabled] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return true;
      const stored = localStorage.getItem('autoPlayTTSEnabled');
      return stored ? stored === 'true' : true; // Default to true (auto-play)
    },
  );

  const [ttsVoiceId, setTtsVoiceId] = useState<string>(
    () => {
      if (typeof window === 'undefined') return 'phuongnhi-north';
      return localStorage.getItem('ttsVoiceId') || 'phuongnhi-north';
    },
  );
  const [voices, setVoices] = useState<string[]>([]);

  // Save preferences to localStorage
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

  // Fetch available TTS voices
  useEffect(() => {
    fetch('/api/voices')
      .then((r) => r.json())
      .then((data) => {
        const ids: string[] = (data.voices ?? []).map((v: any) => v.id as string);
        if (ids.length) setVoices(ids);
      })
      .catch(() => {});
  }, []);

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
    if (finalAgentConfig === 'leadgenTNDS' || finalAgentConfig === 'carebotAuto365') {
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

  // Auto-connect disabled — user must press Connect manually.
  // useEffect(() => {
  //   if (selectedAgentName && sessionStatus === "DISCONNECTED") {
  //     connectToRealtime();
  //   }
  // }, [selectedAgentName]);

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
  }, [selectedAgentConfigSet, selectedAgentName, sessionStatus, agentSetKey, abicTestMode]);

  useEffect(() => {
    if (sessionStatus === "CONNECTED") {
      updateSession();
    }
  }, [isPTTActive]);

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

  const connectToRealtime = async () => {
    const agentSetKey = searchParams.get("agentConfig") || "default";
    if (sdkScenarioMap[agentSetKey]) {
      if (sessionStatus !== "DISCONNECTED") return;
      setSessionStatus("CONNECTING");

      try {
        const EPHEMERAL_KEY = await fetchEphemeralKey();
        if (!EPHEMERAL_KEY) return;

        // Ensure the selectedAgentName is first so that it becomes the root
        const reorderedAgents = [...sdkScenarioMap[agentSetKey]];
        // customData is passed to tools via runContext.context.customData (single source of truth).
        let customData: Record<string, any> = {};
        const idx = reorderedAgents.findIndex((a) => a.name === selectedAgentName);
        if (idx > 0) {
          const [agent] = reorderedAgents.splice(idx, 1);
          reorderedAgents.unshift(agent);
        }

        if (agentSetKey === 'leadgenTNDS') {
          const leadQuery = new URLSearchParams();
          const leadId = searchParams.get('leadId');
          const phoneNumber = searchParams.get('phoneNumber');
          if (leadId) leadQuery.set('leadId', leadId);
          if (phoneNumber) leadQuery.set('phoneNumber', phoneNumber);
          const queryStr = leadQuery.toString();
          const leadRes = await fetch(`/api/leadgen/call-context${queryStr ? `?${queryStr}` : ''}`);
          if (!leadRes.ok) {
            throw new Error('Lead context API failed. Cannot start leadgen call without context.');
          }
          const leadData = (await leadRes.json()) as { lead?: Record<string, any> | null };
          const lead = leadData?.lead ?? null;
          if (!lead) {
            throw new Error('Lead context is missing. Cannot start leadgen call without context.');
          }
          const genderOverride = leadgenGender.trim();
          const nameOverride = leadgenName.trim();
          const plateOverride = leadgenPlate.trim();
          const gender = genderOverride || String(lead.gender ?? lead.genger ?? 'Anh chị').trim();
          const genger = genderOverride || String(lead.genger ?? lead.gender ?? gender).trim();
          const name = nameOverride || String(lead.name ?? lead.fullName ?? 'mình').trim();
          const bks = plateOverride || String(lead.BKS ?? lead.plateNumber ?? 'xe của mình').trim();
          const openingText =
            `Dạ ${gender} ${name} ơi. Em ở bên bảo hiểm xe ô tô í ${gender}. ` +
            `Em check thấy xe biển số ${bks} của ${gender} sắp hết hạn rồi này. ` +
            `Em viết nối hạn luôn cho ${genger} nha.`;
          reorderedAgents[0] = createLeadgenRouterAgent(openingText);
          customData = {
            leadId: lead.leadId,
            phone: lead.phoneNumber,
            gender: genderOverride || undefined,
            name: nameOverride || undefined,
            plate: plateOverride || undefined,
          };
        }

        if (agentSetKey === 'carebotAuto365') {
          const pronoun = carebotPronoun.trim().toLowerCase() === 'chi' ? 'chị' : 'anh';
          const customerName = carebotCustomerName.trim() || 'mình';
          const agentName = carebotAgentName.trim() || 'Thảo';
          const companyName = carebotCompanyName.trim() || 'Bảo hiểm xe ô tô';
          const licensePlate = carebotLicensePlate.trim() || 'xe của mình';
          const expiryDate = carebotExpiryDate.trim() || 'thời gian tới';
          const discountInfo = carebotDiscountInfo.trim();
          const baseFee = carebotBaseFee.trim();
          const discountPercent = carebotDiscountPercent.trim();
          const discountedFee = carebotDiscountedFee.trim();
          const priceClause =
            baseFee && discountPercent && discountedFee
              ? `phí gốc ${baseFee}, đang giảm ${discountPercent}%, còn ${discountedFee}`
              : discountInfo
                ? `bên em có ưu đãi ${discountInfo}`
                : '';
          const firstLine = `Dạ em chào ${pronoun} ${customerName}, em ${agentName} bên ${companyName} ạ.`;
          const secondLine =
            `Dạ em thấy xe ${licensePlate} sắp hết hạn vào ngày ${expiryDate}` +
            (priceClause ? `, ${priceClause}` : '') +
            `, mình để em hỗ trợ gia hạn luôn nhé ạ?`;

          const renewalIdx = reorderedAgents.findIndex((a) => a.name === 'renewalReminderAgent');
          if (renewalIdx >= 0) {
            reorderedAgents[renewalIdx] = createRenewalReminderAgent({
              firstLine,
              secondLine,
            });
          }
          if (selectedAgentName === 'renewalReminderAgent') {
            reorderedAgents[0] = createRenewalReminderAgent({
              firstLine,
              secondLine,
            });
          }
          const campaignTypeRaw = carebotCampaignType || carebotFeDefaults.campaignType;
          const preferredPronounRaw = carebotPronoun || carebotFeDefaults.preferredPronoun;
          customData = {
            campaignType: carebotCampaignTypes.has(campaignTypeRaw as CampaignType)
              ? campaignTypeRaw
              : carebotFeDefaults.campaignType,
            triggerReason: carebotTriggerReason.trim() || carebotFeDefaults.triggerReason,
            customerId: carebotCustomerId.trim() || carebotFeDefaults.customerId,
            customerName: carebotCustomerName.trim() || carebotFeDefaults.customerName,
            phoneNumber: carebotPhoneNumber.trim() || carebotFeDefaults.phoneNumber,
            preferredPronoun: carebotPronouns.has(preferredPronounRaw as PreferredPronoun)
              ? preferredPronounRaw
              : 'anh',
            licensePlate: carebotLicensePlate.trim() || carebotFeDefaults.licensePlate,
            expiryDate: carebotExpiryDate.trim() || carebotFeDefaults.expiryDate,
            baseFee: carebotBaseFee.trim() || carebotFeDefaults.baseFee,
            discountPercent: carebotDiscountPercent.trim() || carebotFeDefaults.discountPercent,
            discountedFee: carebotDiscountedFee.trim() || carebotFeDefaults.discountedFee,
            discountInfo: carebotDiscountInfo.trim() || carebotFeDefaults.discountInfo,
            agentName: carebotAgentName.trim() || carebotFeDefaults.agentName,
            companyName: carebotCompanyName.trim() || carebotFeDefaults.companyName,
            hotlineNumber: carebotHotlineNumber.trim() || carebotFeDefaults.hotlineNumber,
          };
        }

        if (agentSetKey === 'abicHotline') {
          customData = { agentConfig: agentSetKey, sessionId: callSessionId };
        }

        if (agentSetKey === 'leadgenMultiAgent') {
          const parsedSeats = parseInt(multiNumSeats.trim(), 10);
          const parsedWeight = parseFloat(multiWeightTons.trim());
          const runtimeOverrides = {
            sessionId:           callSessionId,
            phoneNumber:         multiPhone.trim()      || undefined,
            displayAgentName:    multiAgentName.trim()  || undefined,
            overrideGender:      multiGender.trim()     || undefined,
            overrideName:        multiName.trim()       || undefined,
            overridePlate:       multiPlate.trim()      || undefined,
            overrideAddress:     multiAddress.trim()    || undefined,
            overrideBrand:       multiBrand.trim()      || undefined,
            overrideColor:       multiColor.trim()      || undefined,
            overrideVehicleType: (multiVehicleType.trim() as any) || undefined,
            overrideNumSeats:    Number.isFinite(parsedSeats) && parsedSeats > 0 ? parsedSeats : undefined,
            overrideIsBusiness:  multiIsBusiness === 'true' ? true : multiIsBusiness === 'false' ? false : undefined,
            overrideWeightTons:  Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
            overrideExpiryDate:  multiExpiryDate.trim() || undefined,
          };
          setLeadgenMultiAgentRuntimeContext(runtimeOverrides);
          customData = {
            session_id:   callSessionId,
            phone:        runtimeOverrides.phoneNumber,
            gender:       runtimeOverrides.overrideGender,
            name:         runtimeOverrides.overrideName,
            plate:        runtimeOverrides.overridePlate,
            address:      runtimeOverrides.overrideAddress,
            brand:        runtimeOverrides.overrideBrand,
            color:        runtimeOverrides.overrideColor,
            vehicle_type: runtimeOverrides.overrideVehicleType,
            num_seats:    runtimeOverrides.overrideNumSeats,
            is_business:  runtimeOverrides.overrideIsBusiness,
            weight_tons:  runtimeOverrides.overrideWeightTons,
            expiry_date:  runtimeOverrides.overrideExpiryDate,
          };
        }

        const companyName = agentSetKey === 'customerServiceRetail'
          ? customerServiceRetailCompanyName
          : chatSupervisorCompanyName;
        
        // Force text-only globally to disable OpenAI Realtime TTS.
        const isTextOnlyMode = true;
        
        // Guardrails:
        // - Moderation for some scenarios
        // - Tool-required for ABIC travel agent to enforce deterministic policy tool usage
        const guardrails = [];
        if (!isTextOnlyMode && ['customerServiceRetail', 'chatSupervisor'].includes(agentSetKey)) {
          guardrails.push(createModerationGuardrail(companyName));
        }
        if (agentSetKey === 'leadgenTNDS') {
          guardrails.push(createLeadgenOpeningGuardrail());
          guardrails.push(createLeadgenFaqToolRequiredGuardrail());
        }
        // NOTE: Avoid output guardrails for abicHotline to prevent response loops.

        await connect({
          getEphemeralKey: async () => EPHEMERAL_KEY,
          initialAgents: reorderedAgents,
          audioElement: sdkAudioElement,
          outputGuardrails: guardrails,
          extraContext: {
            addTranscriptBreadcrumb,
            customData,
          },
          isTextOnly: isTextOnlyMode,
          disableMicInput: isChatOnlyMode,
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
    const turnDetection = isPTTActive
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
        output_modalities: ['text'],
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
          output_modalities: ['text'],
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

  const handleApplyLeadgenOverrides = () => {
    const url = new URL(window.location.toString());
    const updates: Array<[string, string]> = [
      ['leadGender', leadgenGender.trim()],
      ['leadName', leadgenName.trim()],
      ['leadPlate', leadgenPlate.trim()],
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

  const handleApplyMultiAgentOverrides = () => {
    if (sessionStatus === 'CONNECTED' || sessionStatus === 'CONNECTING') {
      disconnectFromRealtime();
      setSessionStatus('DISCONNECTED');
      setTimeout(() => { connectToRealtime(); }, 150);
    }
  };

  const handleApplyCarebotOverrides = () => {
    const url = new URL(window.location.toString());
    const updates: Array<[string, string]> = [
      ['campaignType', carebotCampaignType.trim()],
      ['triggerReason', carebotTriggerReason.trim()],
      ['customerId', carebotCustomerId.trim()],
      ['customerName', carebotCustomerName.trim()],
      ['phoneNumber', carebotPhoneNumber.trim()],
      ['preferredPronoun', carebotPronoun.trim()],
      ['licensePlate', carebotLicensePlate.trim()],
      ['expiryDate', carebotExpiryDate.trim()],
      ['baseFee', carebotBaseFee.trim()],
      ['discountPercent', carebotDiscountPercent.trim()],
      ['discountedFee', carebotDiscountedFee.trim()],
      ['discountInfo', carebotDiscountInfo.trim()],
      ['agentName', carebotAgentName.trim()],
      ['companyName', carebotCompanyName.trim()],
      ['hotlineNumber', carebotHotlineNumber.trim()],
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
    if (storedPushToTalkUI) {
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
  }, []);

  useEffect(() => {
    localStorage.setItem("pushToTalkUI", isPTTActive.toString());
  }, [isPTTActive]);

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

          {agentSetKey === 'abicHotline' && (
            <div className="flex items-center ml-6">
              <label className="flex items-center text-base gap-1 mr-2 font-medium">
                ABIC Doc Test
              </label>
              <div className="relative inline-block">
                <select
                  value={abicTestMode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAbicTestMode(val);
                    const url = new URL(window.location.toString());
                    if (val === 'off') {
                      url.searchParams.delete('abicTestB3');
                    } else {
                      url.searchParams.set('abicTestB3', val);
                    }
                    window.history.replaceState({}, '', url.toString());
                  }}
                  className="appearance-none border border-gray-300 rounded-lg text-base px-2 py-1 pr-8 cursor-pointer font-normal focus:outline-none"
                >
                  <option value="off">Off</option>
                  <option value="international">B3 - Quốc tế</option>
                  <option value="domestic">B3 - Trong nước</option>
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
            </div>
          )}
        </div>
      </div>

      {agentSetKey === 'leadgenTNDS' && (
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
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-36"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Biển số</label>
            <input
              value={leadgenPlate}
              onChange={(e) => setLeadgenPlate(e.target.value)}
              placeholder="29A-86256"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-36"
            />
          </div>
          <button
            onClick={handleApplyLeadgenOverrides}
            className="border border-gray-300 rounded-lg text-sm px-3 py-1 bg-white hover:bg-gray-50"
          >
            Áp dụng
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
            <input
              type="checkbox"
              checked={carebotChatOnly}
              onChange={(e) => setCarebotChatOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Chat only (không dùng ASR)
          </label>
        </div>
      )}

      {agentSetKey === 'leadgenMultiAgent' && (
        <div className="px-5 pb-2 flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Xưng hô</label>
            <input value={multiGender} onChange={(e) => setMultiGender(e.target.value)} placeholder="Anh / Chị" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên khách</label>
            <input value={multiName} onChange={(e) => setMultiName(e.target.value)} placeholder="Bảo" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">SĐT</label>
            <input value={multiPhone} onChange={(e) => setMultiPhone(e.target.value)} placeholder="09..." className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên agent</label>
            <input value={multiAgentName} onChange={(e) => setMultiAgentName(e.target.value)} placeholder="Thảo" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Biển số</label>
            <input value={multiPlate} onChange={(e) => setMultiPlate(e.target.value)} placeholder="29A-86256" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Địa chỉ</label>
            <input value={multiAddress} onChange={(e) => setMultiAddress(e.target.value)} placeholder="12 Nguyễn Trãi, Hà Nội" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-44" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Hãng xe</label>
            <input value={multiBrand} onChange={(e) => setMultiBrand(e.target.value)} placeholder="Toyota" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Màu xe</label>
            <input value={multiColor} onChange={(e) => setMultiColor(e.target.value)} placeholder="Trắng" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-20" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Loại xe</label>
            <select value={multiVehicleType} onChange={(e) => setMultiVehicleType(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28">
              <option value="">Chưa chọn</option>
              <option value="car">Xe con</option>
              <option value="pickup">Bán tải</option>
              <option value="truck">Xe tải</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Số chỗ</label>
            <input value={multiNumSeats} onChange={(e) => setMultiNumSeats(e.target.value)} placeholder="5" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-16" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Kinh doanh</label>
            <select value={multiIsBusiness} onChange={(e) => setMultiIsBusiness(e.target.value)} className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24">
              <option value="">Chưa rõ</option>
              <option value="false">Không</option>
              <option value="true">Có</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Trọng tải</label>
            <input value={multiWeightTons} onChange={(e) => setMultiWeightTons(e.target.value)} placeholder="1.5" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-16" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Hết hạn</label>
            <input value={multiExpiryDate} onChange={(e) => setMultiExpiryDate(e.target.value)} placeholder="15/05/2026" className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28" />
          </div>
          <button onClick={handleApplyMultiAgentOverrides} className="border border-gray-300 rounded-lg text-sm px-3 py-1 bg-white hover:bg-gray-50">
            Áp dụng
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
            <input
              type="checkbox"
              checked={carebotChatOnly}
              onChange={(e) => setCarebotChatOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Chat only (không dùng ASR)
          </label>
        </div>
      )}

      {agentSetKey === 'carebotAuto365' && (
        <div className="px-5 pb-2 flex items-end gap-2 flex-wrap">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Campaign</label>
            <select
              value={carebotCampaignType}
              onChange={(e) => setCarebotCampaignType(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-48"
            >
              <option value="renewal_reminder">renewal_reminder</option>
              <option value="post_sale_safety">post_sale_safety</option>
              <option value="post_sale_digital_card">post_sale_digital_card</option>
              <option value="holiday_care">holiday_care</option>
              <option value="activation_365">activation_365</option>
              <option value="monthly_checkin">monthly_checkin</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên khách</label>
            <input
              value={carebotCustomerName}
              onChange={(e) => setCarebotCustomerName(e.target.value)}
              placeholder="Minh"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Customer ID</label>
            <input
              value={carebotCustomerId}
              onChange={(e) => setCarebotCustomerId(e.target.value)}
              placeholder="C001"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Phone</label>
            <input
              value={carebotPhoneNumber}
              onChange={(e) => setCarebotPhoneNumber(e.target.value)}
              placeholder="0900000000"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Xưng hô</label>
            <select
              value={carebotPronoun}
              onChange={(e) => setCarebotPronoun(e.target.value)}
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-24"
            >
              <option value="anh">anh</option>
              <option value="chi">chi</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Tên agent</label>
            <input
              value={carebotAgentName}
              onChange={(e) => setCarebotAgentName(e.target.value)}
              placeholder="Thảo"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Công ty</label>
            <input
              value={carebotCompanyName}
              onChange={(e) => setCarebotCompanyName(e.target.value)}
              placeholder="Bảo hiểm ABC"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-44"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Biển số</label>
            <input
              value={carebotLicensePlate}
              onChange={(e) => setCarebotLicensePlate(e.target.value)}
              placeholder="51A-12345"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Ngày hết hạn</label>
            <input
              value={carebotExpiryDate}
              onChange={(e) => setCarebotExpiryDate(e.target.value)}
              placeholder="28/03/2026"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Ưu đãi</label>
            <input
              value={carebotDiscountInfo}
              onChange={(e) => setCarebotDiscountInfo(e.target.value)}
              placeholder="Giảm 15%"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-36"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Phí gốc</label>
            <input
              value={carebotBaseFee}
              onChange={(e) => setCarebotBaseFee(e.target.value)}
              placeholder="535.000 đồng"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">% giảm</label>
            <input
              value={carebotDiscountPercent}
              onChange={(e) => setCarebotDiscountPercent(e.target.value)}
              placeholder="15"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-20"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Phí ưu đãi</label>
            <input
              value={carebotDiscountedFee}
              onChange={(e) => setCarebotDiscountedFee(e.target.value)}
              placeholder="455.000 đồng"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-32"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Trigger</label>
            <input
              value={carebotTriggerReason}
              onChange={(e) => setCarebotTriggerReason(e.target.value)}
              placeholder="scheduled_campaign"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-40"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600">Hotline</label>
            <input
              value={carebotHotlineNumber}
              onChange={(e) => setCarebotHotlineNumber(e.target.value)}
              placeholder="1900-0000"
              className="border border-gray-300 rounded-lg text-sm px-2 py-1 w-28"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-1">
            <input
              type="checkbox"
              checked={carebotChatOnly}
              onChange={(e) => setCarebotChatOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Chat only (không dùng ASR)
          </label>
          <button
            onClick={handleApplyCarebotOverrides}
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
          ttsVoiceId={ttsVoiceId}
          // Force streaming mode to avoid offline fetch timeouts
          ttsMode={"streaming"}
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
        voices={voices}
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
