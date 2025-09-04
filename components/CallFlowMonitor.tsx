/**
 * CALL FLOW MONITOR
 *
 * Development-time component that monitors call flow health
 * and alerts developers when the critical call flow sync issue occurs.
 *
 * This component should only be rendered in development mode.
 */

import React, { useEffect, useState } from "react";

interface CallFlowMonitorProps {
  telnyxState: string;
  uiState: string;
  isConnecting: boolean;
  isCallActive: boolean;
  callDuration: number;
  getCallFlowHealth: () => {
    isHealthy: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

const CallFlowMonitor: React.FC<CallFlowMonitorProps> = ({
  telnyxState,
  uiState,
  isConnecting,
  isCallActive,
  callDuration,
  getCallFlowHealth,
}) => {
  const [health, setHealth] = useState(getCallFlowHealth());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const newHealth = getCallFlowHealth();
    setHealth(newHealth);

    // Auto-show monitor if there are critical issues
    if (!newHealth.isHealthy && newHealth.score < 50) {
      setIsVisible(true);
    }
  }, [
    telnyxState,
    uiState,
    isConnecting,
    isCallActive,
    callDuration,
    getCallFlowHealth,
  ]);

  // Only render in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    return "bg-red-100";
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={`fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white font-bold transition-all ${
          health.isHealthy
            ? "bg-green-500 hover:bg-green-600"
            : "bg-red-500 hover:bg-red-600"
        }`}
        title={`Call Flow Health: ${health.score}/100`}
      >
        {health.score}
      </button>

      {/* Monitor Panel */}
      {isVisible && (
        <div className="fixed bottom-20 right-4 z-50 w-96 max-h-96 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-lg">Call Flow Monitor</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* Health Score */}
          <div
            className={`p-3 rounded-lg mb-3 ${getScoreBgColor(health.score)}`}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">Health Score:</span>
              <span
                className={`font-bold text-lg ${getScoreColor(health.score)}`}
              >
                {health.score}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  health.score >= 80
                    ? "bg-green-500"
                    : health.score >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${health.score}%` }}
              />
            </div>
          </div>

          {/* Current State */}
          <div className="mb-3">
            <h4 className="font-medium mb-2">Current State:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium">Telnyx:</span>
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                  {telnyxState}
                </span>
              </div>
              <div>
                <span className="font-medium">UI:</span>
                <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                  {uiState}
                </span>
              </div>
              <div>
                <span className="font-medium">Connecting:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded text-xs ${
                    isConnecting
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {isConnecting ? "Yes" : "No"}
                </span>
              </div>
              <div>
                <span className="font-medium">Active:</span>
                <span
                  className={`ml-2 px-2 py-1 rounded text-xs ${
                    isCallActive
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {isCallActive ? "Yes" : "No"}
                </span>
              </div>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">Duration:</span>
              <span className="ml-2">{callDuration.toFixed(1)}s</span>
            </div>
          </div>

          {/* Issues */}
          {health.issues.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium mb-2 text-red-600">
                Issues Detected:
              </h4>
              <ul className="text-sm space-y-1">
                {health.issues.map((issue, index) => (
                  <li
                    key={index}
                    className="text-red-700 bg-red-50 p-2 rounded"
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {health.recommendations.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium mb-2 text-blue-600">
                Recommendations:
              </h4>
              <ul className="text-sm space-y-1">
                {health.recommendations.map((rec, index) => (
                  <li
                    key={index}
                    className="text-blue-700 bg-blue-50 p-2 rounded"
                  >
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Critical Sync Issue Warning */}
          {telnyxState === "early" && uiState === "dialing" && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
              <div className="flex items-center mb-2">
                <span className="text-red-600 font-bold text-lg mr-2">🚨</span>
                <span className="font-bold text-red-800">
                  CRITICAL SYNC ISSUE
                </span>
              </div>
              <p className="text-sm text-red-700">
                Telnyx is ringing but UI shows dialing. This is the main issue
                that causes ringing to only start after redirect to dialpad.
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-gray-500 mt-3 pt-2 border-t">
            This monitor only appears in development mode.
            <br />
            Call flow health is critical for user experience.
          </div>
        </div>
      )}
    </>
  );
};

export default CallFlowMonitor;
