"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
    text_tokens?: number;
  };
  output_tokens_details?: {
    audio_tokens?: number;
    text_tokens?: number;
  };
}

export interface RequestUsage {
  timestamp: string;
  type: 'realtime' | 'responses' | 'session';
  usage: UsageStats;
  cost?: number; // USD
  model?: string;
}

interface UsageContextType {
  currentSessionUsage: UsageStats;
  allRequests: RequestUsage[];
  addUsage: (usage: UsageStats, type: RequestUsage['type'], model?: string) => void;
  resetSession: () => void;
  getTotalCost: () => number;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

const initialUsage: UsageStats = {
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
};

// Pricing per 1M tokens (as of Nov 2024)
const PRICING = {
  'gpt-4o-mini-realtime-preview': {
    input: 0.60,   // $0.60 per 1M input tokens
    output: 2.40,  // $2.40 per 1M output tokens
    audio_input: 0.60,
    audio_output: 2.40,
  },
  'gpt-4o-realtime-preview': {
    input: 5.00,
    output: 20.00,
    audio_input: 5.00,
    audio_output: 20.00,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
  },
  'gpt-4.1': {
    input: 2.50,
    output: 10.00,
  },
};

function calculateCost(usage: UsageStats, model: string = process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini-realtime-preview'): number {
  const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gpt-4o-mini-realtime-preview'];
  
  let cost = 0;
  
  // Basic token costs
  cost += (usage.input_tokens / 1_000_000) * pricing.input;
  cost += (usage.output_tokens / 1_000_000) * pricing.output;
  
  // Audio-specific costs (if available)
  if (usage.input_tokens_details?.audio_tokens && 'audio_input' in pricing) {
    const audioInputCost = (usage.input_tokens_details.audio_tokens / 1_000_000) * pricing.audio_input;
    cost += audioInputCost;
  }
  
  if (usage.output_tokens_details?.audio_tokens && 'audio_output' in pricing) {
    const audioOutputCost = (usage.output_tokens_details.audio_tokens / 1_000_000) * pricing.audio_output;
    cost += audioOutputCost;
  }
  
  return cost;
}

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const [currentSessionUsage, setCurrentSessionUsage] = useState<UsageStats>(initialUsage);
  const [allRequests, setAllRequests] = useState<RequestUsage[]>([]);

  const addUsage = useCallback((usage: UsageStats, type: RequestUsage['type'], model?: string) => {
    const cost = calculateCost(usage, model);
    
    const request: RequestUsage = {
      timestamp: new Date().toISOString(),
      type,
      usage,
      cost,
      model,
    };

    setAllRequests(prev => [...prev, request]);
    
    setCurrentSessionUsage(prev => ({
      input_tokens: prev.input_tokens + usage.input_tokens,
      output_tokens: prev.output_tokens + usage.output_tokens,
      total_tokens: prev.total_tokens + usage.total_tokens,
      input_tokens_details: {
        cached_tokens: (prev.input_tokens_details?.cached_tokens || 0) + (usage.input_tokens_details?.cached_tokens || 0),
        audio_tokens: (prev.input_tokens_details?.audio_tokens || 0) + (usage.input_tokens_details?.audio_tokens || 0),
        text_tokens: (prev.input_tokens_details?.text_tokens || 0) + (usage.input_tokens_details?.text_tokens || 0),
      },
      output_tokens_details: {
        audio_tokens: (prev.output_tokens_details?.audio_tokens || 0) + (usage.output_tokens_details?.audio_tokens || 0),
        text_tokens: (prev.output_tokens_details?.text_tokens || 0) + (usage.output_tokens_details?.text_tokens || 0),
      },
    }));
  }, []);

  const resetSession = useCallback(() => {
    setCurrentSessionUsage(initialUsage);
    setAllRequests([]);
  }, []);

  const getTotalCost = useCallback(() => {
    return allRequests.reduce((sum, req) => sum + (req.cost || 0), 0);
  }, [allRequests]);

  return (
    <UsageContext.Provider
      value={{
        currentSessionUsage,
        allRequests,
        addUsage,
        resetSession,
        getTotalCost,
      }}
    >
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (!context) {
    throw new Error("useUsage must be used within UsageProvider");
  }
  return context;
}

