"use client";

import React, { useState } from "react";
import { useUsage } from "../contexts/UsageContext";

export default function UsageStats() {
  const { currentSessionUsage, allRequests, getTotalCost, resetSession } = useUsage();
  const [isExpanded, setIsExpanded] = useState(false);

  const totalCost = getTotalCost();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-gray-900 text-white rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
        {/* Collapsed View */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="font-mono text-sm">
              {currentSessionUsage.total_tokens.toLocaleString()} tokens
            </span>
            <span className="text-green-400 font-mono text-xs">
              ${totalCost.toFixed(4)}
            </span>
          </div>
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-700">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Session Usage</h3>
                <button
                  onClick={resetSession}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Reset
                </button>
              </div>

              {/* Token Stats */}
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Input tokens:</span>
                  <span className="text-blue-400">{currentSessionUsage.input_tokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Output tokens:</span>
                  <span className="text-green-400">{currentSessionUsage.output_tokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                  <span className="text-gray-300 font-semibold">Total:</span>
                  <span className="text-white font-semibold">{currentSessionUsage.total_tokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-gray-700">
                  <span className="text-gray-300 font-semibold">Cost:</span>
                  <span className="text-green-400 font-semibold">${totalCost.toFixed(4)}</span>
                </div>
              </div>

              {/* Details Breakdown */}
              {(currentSessionUsage.input_tokens_details?.text_tokens || 
                currentSessionUsage.input_tokens_details?.audio_tokens) && (
                <div className="space-y-2 text-xs font-mono pt-2">
                  <div className="text-gray-500 text-xs">Details:</div>
                  {(currentSessionUsage.input_tokens_details?.text_tokens || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Input (text):</span>
                      <span>{(currentSessionUsage.input_tokens_details?.text_tokens || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(currentSessionUsage.input_tokens_details?.audio_tokens || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Input (audio):</span>
                      <span>{(currentSessionUsage.input_tokens_details?.audio_tokens || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(currentSessionUsage.output_tokens_details?.text_tokens || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Output (text):</span>
                      <span>{(currentSessionUsage.output_tokens_details?.text_tokens || 0).toLocaleString()}</span>
                    </div>
                  )}
                  {(currentSessionUsage.output_tokens_details?.audio_tokens || 0) > 0 && (
                    <div className="flex justify-between items-center text-gray-400">
                      <span>Output (audio):</span>
                      <span>{(currentSessionUsage.output_tokens_details?.audio_tokens || 0).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Request History */}
              {allRequests.length > 0 && (
                <div className="pt-3 border-t border-gray-700">
                  <div className="text-gray-500 text-xs mb-2">
                    Recent requests ({allRequests.length}):
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {allRequests.slice(-10).reverse().map((req, idx) => (
                      <div
                        key={idx}
                        className="text-xs p-2 bg-gray-800 rounded flex justify-between items-center"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{req.type}</span>
                            {req.model && (
                              <span className="text-gray-600 text-[10px]">{req.model}</span>
                            )}
                          </div>
                          <div className="text-gray-500 text-[10px]">
                            {new Date(req.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white">{req.usage.total_tokens}</div>
                          <div className="text-green-400 text-[10px]">
                            ${(req.cost || 0).toFixed(4)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

