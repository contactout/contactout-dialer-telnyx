import React, { useState, useMemo } from "react";
import { CallRecord } from "@/hooks/useCallHistory";
import {
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  PhoneMissed,
  PhoneIncoming,
  ArrowUpRight,
  ArrowDownLeft,
  Voicemail,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import { detectCountry, formatPhoneNumber } from "@/lib/phoneNumberUtils";

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
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  // Group calls by date (Today, Yesterday, This Week, etc.)
  const groupedCalls = useMemo(() => {
    const groups: { [key: string]: CallRecord[] } = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    callHistory.forEach((call) => {
      const callDate = new Date(call.timestamp);
      let groupKey: string;

      if (callDate >= today) {
        groupKey = "Today";
      } else if (callDate >= yesterday) {
        groupKey = "Yesterday";
      } else if (callDate >= thisWeek) {
        groupKey = "This Week";
      } else {
        groupKey = callDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year:
            callDate.getFullYear() !== now.getFullYear()
              ? "numeric"
              : undefined,
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(call);
    });

    return groups;
  }, [callHistory]);

  // Determine call direction and status
  const getCallDirection = (call: CallRecord) => {
    // For now, assume all calls are outgoing since this is a dialer
    // In a real app, you'd check call.direction or similar field
    return "outgoing";
  };

  const getCallStatusInfo = (call: CallRecord) => {
    const direction = getCallDirection(call);

    switch (call.status) {
      case "completed":
        return {
          icon:
            direction === "outgoing" ? (
              <ArrowUpRight className="w-4 h-4 text-green-600" />
            ) : (
              <ArrowDownLeft className="w-4 h-4 text-green-600" />
            ),
          color: "text-green-600",
          bgColor: "bg-green-50",
          label: "Completed",
        };
      case "failed":
        return {
          icon:
            direction === "outgoing" ? (
              <ArrowUpRight className="w-4 h-4 text-red-600" />
            ) : (
              <ArrowDownLeft className="w-4 h-4 text-red-600" />
            ),
          color: "text-red-600",
          bgColor: "bg-red-50",
          label: getFailureReason(call),
        };
      case "voicemail":
        return {
          icon: <Voicemail className="w-4 h-4 text-blue-600" />,
          color: "text-blue-600",
          bgColor: "bg-blue-50",
          label: "Voicemail",
        };
      case "missed":
        return {
          icon: <PhoneMissed className="w-4 h-4 text-orange-600" />,
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          label: "Missed",
        };
      default:
        return {
          icon: <Clock className="w-4 h-4 text-gray-600" />,
          color: "text-gray-600",
          bgColor: "bg-gray-50",
          label: "Unknown",
        };
    }
  };

  const getFailureReason = (call: CallRecord) => {
    if (call.hangup_cause) {
      switch (call.hangup_cause) {
        case "USER_BUSY":
        case "busy":
        case "user_busy":
          return "Busy";
        case "call_rejected":
        case "rejected":
          return "Declined";
        case "no_answer":
        case "no-answer":
          return "No Answer";
        case "unallocated_number":
          return "Invalid Number";
        case "network_error":
          return "Network Error";
        case "timeout":
          return "Timeout";
        default:
          return "Failed";
      }
    }
    return "Failed";
  };

  const formatDuration = (duration: number) => {
    if (!duration || duration <= 0) {
      return "";
    }
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
      {/* Header with call count */}
      <div className="mb-4 text-center">
        <p className="text-sm text-gray-500">
          {callHistory.length > 0
            ? `${callHistory.length} call${callHistory.length !== 1 ? "s" : ""}`
            : "No calls yet"}
        </p>
      </div>

      {/* Call List - Phone-like grouped design */}
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
            {Object.entries(groupedCalls).map(([groupName, calls]) => (
              <div key={groupName} className="mb-4">
                {/* Date Group Header */}
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700">
                    {groupName}
                  </h3>
                </div>

                {/* Calls in this group */}
                {calls.map((call) => {
                  const statusInfo = getCallStatusInfo(call);
                  const isExpanded = expandedCall === call.id;

                  return (
                    <div key={call.id} className="border-b border-gray-100">
                      {/* Main call entry */}
                      <div
                        className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 transition-colors duration-150 cursor-pointer"
                        onClick={() =>
                          setExpandedCall(isExpanded ? null : call.id)
                        }
                      >
                        {/* Left side - Status icon and phone number */}
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {/* Status Icon with direction */}
                          <div className="flex-shrink-0">{statusInfo.icon}</div>

                          {/* Phone Number and Details */}
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-medium text-gray-900 truncate flex items-center space-x-2">
                              {/* Country Flag */}
                              {(() => {
                                const country = detectCountry(
                                  call.phone_number
                                );
                                if (country) {
                                  return (
                                    <span
                                      className="text-lg flex-shrink-0"
                                      title={country.name}
                                    >
                                      {country.flag}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {/* Formatted Phone Number */}
                              <span className="truncate">
                                {formatPhoneNumber(call.phone_number) ||
                                  call.phone_number}
                              </span>
                            </div>
                            <div className="flex items-center space-x-3 text-sm text-gray-500 mt-1">
                              <span className="flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                {formatTimestamp(call.timestamp)}
                              </span>
                              {call.duration &&
                                call.duration > 0 &&
                                formatDuration(call.duration) && (
                                  <span>{formatDuration(call.duration)}</span>
                                )}
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}
                              >
                                {statusInfo.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right side - Action buttons */}
                        <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                          {/* Redial button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRedial(call.phone_number);
                            }}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-colors duration-150"
                            title="Redial this number"
                          >
                            <Phone className="w-4 h-4" />
                          </button>

                          {/* Expand button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCall(isExpanded ? null : call.id);
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors duration-150"
                            title="Show details"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                          <div className="space-y-2 text-sm">
                            {/* Call details */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-gray-500">Status:</span>
                                <span className={`ml-2 ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </div>
                              {call.duration && (
                                <div>
                                  <span className="text-gray-500">
                                    Duration:
                                  </span>
                                  <span className="ml-2 text-gray-900">
                                    {formatDuration(call.duration)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Technical details */}
                            {(call.hangup_cause ||
                              call.telnyx_call_id ||
                              call.network_quality) && (
                              <div className="pt-2 border-t border-gray-200">
                                <div className="text-xs text-gray-500 space-y-1">
                                  {call.hangup_cause && (
                                    <div>Hangup cause: {call.hangup_cause}</div>
                                  )}
                                  {call.telnyx_call_id && (
                                    <div>
                                      Call ID: {call.telnyx_call_id.slice(0, 8)}
                                      ...
                                    </div>
                                  )}
                                  {call.network_quality && (
                                    <div>Network: {call.network_quality}</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CallHistory;
