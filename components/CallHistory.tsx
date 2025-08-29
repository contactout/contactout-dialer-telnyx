import React from "react";
import { CallRecord } from "@/hooks/useCallHistory";
import {
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  PhoneMissed,
  PhoneIncoming,
} from "lucide-react";

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
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "missed":
        return <PhoneMissed className="w-4 h-4 text-orange-600" />;
      case "incoming":
        return <PhoneIncoming className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatDuration = (duration: number) => {
    if (duration < 60) {
      return `${duration}s`;
    }
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col justify-center min-h-[600px]">
        <div className="text-center space-y-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-gray-900">
              Loading call history...
            </p>
            <p className="text-sm text-gray-500">
              Please wait while we fetch your calls
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col justify-center min-h-[600px]">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-medium text-gray-900">
              Error loading calls
            </p>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col py-4">
      {/* Simple header */}
      <div className="mb-4 text-center">
        <p className="text-sm text-gray-500">
          {callHistory.length > 0
            ? `${callHistory.length} call${callHistory.length !== 1 ? "s" : ""}`
            : "No calls yet"}
        </p>
      </div>

      {/* Call List - Native phone style */}
      <div className="flex-1 overflow-hidden">
        {callHistory.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <Phone className="w-8 h-8 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-900">No calls yet</p>
              <p className="text-gray-500">
                Make your first call to see history here
              </p>
            </div>
          </div>
        ) : (
          <div className="max-h-[450px] overflow-y-auto">
            {callHistory.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between py-3 px-4 border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150"
              >
                {/* Left side - Status icon and phone number */}
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(call.status)}
                  </div>

                  {/* Phone Number and Details */}
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-gray-900 font-mono truncate">
                      {call.phone_number}
                    </div>
                    <div className="flex items-center space-x-3 text-sm text-gray-500 mt-1">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {formatTimestamp(call.timestamp)}
                      </span>
                      {call.duration && call.duration > 0 && (
                        <span>{formatDuration(call.duration)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side - Redial button */}
                <div className="flex-shrink-0 ml-3">
                  <button
                    onClick={() => onRedial(call.phone_number)}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors duration-150"
                    title="Redial this number"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallHistory;
