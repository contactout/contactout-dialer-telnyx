import React from "react";
import { CallRecord } from "@/hooks/useCallHistory";

interface CallHistoryProps {
  callHistory: CallRecord[];
  onRedial: (phoneNumber: string) => void;
  formatTimestamp: (timestamp: string) => string;
  loading?: boolean;
  error?: string | null;
}

const CallHistory: React.FC<CallHistoryProps> = ({
  callHistory,
  onRedial,
  formatTimestamp,
  loading = false,
  error = null,
}) => {
  const getStatusIcon = (status: CallRecord["status"]) => {
    switch (status) {
      case "completed":
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "failed":
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "missed":
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "incoming":
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStatusColor = (status: CallRecord["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "missed":
        return "bg-yellow-100 text-yellow-800";
      case "incoming":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Loading call history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center space-y-4">
        <div className="text-red-600 text-center">
          <p className="font-medium">Error loading call history</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Call History</h3>
      </div>

      {/* Call List */}
      <div className="flex-1 space-y-2 overflow-y-auto min-h-0">
        {callHistory.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No calls yet</p>
            <p className="text-sm">Make your first call to see history here</p>
          </div>
        ) : (
          callHistory.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {/* Call Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      call.status
                    )}`}
                  >
                    {getStatusIcon(call.status)}
                    <span className="ml-1 capitalize">{call.status}</span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(call.timestamp)}
                  </span>
                </div>
                <div className="text-sm font-medium text-gray-900 truncate">
                  {call.phone_number}
                </div>
                {/* Duration Information Only */}
                {call.duration && (
                  <div className="text-xs text-gray-500 mt-1">
                    Duration: {Math.round((call.duration / 60) * 100) / 100} min
                  </div>
                )}
              </div>

              {/* Actions - Only Redial */}
              <div className="flex items-center ml-4">
                <button
                  onClick={() => onRedial(call.phone_number)}
                  className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors"
                  title="Redial"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CallHistory;
