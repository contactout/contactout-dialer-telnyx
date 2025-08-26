import React, { useState, useEffect } from "react";

interface SessionTimeoutWarningProps {
  isVisible: boolean;
  timeRemaining: number;
  onExtendSession: () => void;
  onLogout: () => void;
}

const SessionTimeoutWarning: React.FC<SessionTimeoutWarningProps> = ({
  isVisible,
  timeRemaining,
  onExtendSession,
  onLogout,
}) => {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (isVisible && timeRemaining <= 300000) {
      // Show warning 5 minutes before expiry
      setShowWarning(true);
    } else {
      setShowWarning(false);
    }
  }, [isVisible, timeRemaining]);

  if (!showWarning) return null;

  const minutesRemaining = Math.ceil(timeRemaining / 60000);
  const isCritical = timeRemaining <= 60000; // Critical when less than 1 minute

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="text-center">
          {/* Warning Icon */}
          <div
            className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
              isCritical ? "bg-red-100" : "bg-yellow-100"
            } mb-4`}
          >
            <svg
              className={`h-6 w-6 ${
                isCritical ? "text-red-600" : "text-yellow-600"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          {/* Warning Message */}
          <h3
            className={`text-lg font-medium ${
              isCritical ? "text-red-900" : "text-yellow-900"
            } mb-2`}
          >
            {isCritical ? "Session Expiring Soon!" : "Session Timeout Warning"}
          </h3>

          <p className="text-sm text-gray-600 mb-4">
            {isCritical
              ? `Your session will expire in less than ${minutesRemaining} minute${
                  minutesRemaining !== 1 ? "s" : ""
                }.`
              : `Your session will expire in ${minutesRemaining} minute${
                  minutesRemaining !== 1 ? "s" : ""
                }.`}
          </p>

          {/* Time Remaining Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                isCritical ? "bg-red-500" : "bg-yellow-500"
              }`}
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (timeRemaining / 300000) * 100)
                )}%`,
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={onExtendSession}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${
                isCritical
                  ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                  : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
              } focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              Extend Session
            </button>
            <button
              onClick={onLogout}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              Logout Now
            </button>
          </div>

          {/* Additional Info */}
          <p className="text-xs text-gray-500 mt-4">
            For security reasons, sessions automatically expire after 4 hours of
            inactivity.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutWarning;
