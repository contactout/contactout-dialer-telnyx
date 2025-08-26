import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { TelnyxCostCalculator } from "@/lib/costCalculator";

interface CallCostRecord {
  id: string;
  phone_number: string;
  status: string;
  timestamp: string;
  duration?: number;
  voice_cost: number;
  sip_trunking_cost: number;
  total_cost: number;
  currency: string;
  destination_country?: string;
  user_id: string;
}

interface UserInfo {
  id: string;
  email: string;
  full_name?: string;
}

interface CallCostHistoryProps {
  isVisible: boolean;
  onClose: () => void;
}

const CallCostHistory: React.FC<CallCostHistoryProps> = ({
  isVisible,
  onClose,
}) => {
  const [callCosts, setCallCosts] = useState<CallCostRecord[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCosts, setTotalCosts] = useState({
    totalCalls: 0,
    totalVoiceCost: 0,
    totalSipTrunkingCost: 0,
    totalCost: 0,
  });

  useEffect(() => {
    if (isVisible) {
      fetchCallCosts();
      fetchUsers();
    }
  }, [isVisible]);

  const fetchCallCosts = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100); // Limit to last 100 calls for performance

      if (error) throw error;

      setCallCosts(data || []);
      calculateTotalCosts(data || []);
    } catch (err: any) {
      console.error("Error fetching call costs:", err);
      setError(err.message || "Failed to fetch call costs");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name");

      if (error) throw error;

      const usersMap: Record<string, UserInfo> = {};
      (data || []).forEach((user) => {
        usersMap[user.id] = user;
      });

      setUsers(usersMap);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      // Don't set error for users - we can still show call costs
    }
  };

  const calculateTotalCosts = (calls: CallCostRecord[]) => {
    const totals = calls.reduce(
      (acc, call) => ({
        totalCalls: acc.totalCalls + 1,
        totalVoiceCost: acc.totalVoiceCost + (call.voice_cost || 0),
        totalSipTrunkingCost:
          acc.totalSipTrunkingCost + (call.sip_trunking_cost || 0),
        totalCost: acc.totalCost + (call.total_cost || 0),
      }),
      {
        totalCalls: 0,
        totalVoiceCost: 0,
        totalSipTrunkingCost: 0,
        totalCost: 0,
      }
    );

    setTotalCosts(totals);
  };

  const formatCost = (cost: number) => {
    return TelnyxCostCalculator.formatCost(cost, "USD");
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "N/A";
    const minutes = seconds / 60;
    return `${Math.round(minutes * 100) / 100} min`;
  };

  const getStatusColor = (status: string) => {
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

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Call Cost History
            </h2>
            <p className="text-sm text-gray-600">
              Detailed cost breakdown for all calls
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Cost Summary */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {totalCosts.totalCalls}
              </div>
              <div className="text-sm text-gray-600">Total Calls</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatCost(totalCosts.totalVoiceCost)}
              </div>
              <div className="text-sm text-gray-600">Voice Costs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatCost(totalCosts.totalSipTrunkingCost)}
              </div>
              <div className="text-sm text-gray-600">SIP Trunking</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCost(totalCosts.totalCost)}
              </div>
              <div className="text-sm text-gray-600">Total Cost</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading call costs...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 text-xl mb-4">⚠️ {error}</div>
              <button
                onClick={fetchCallCosts}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : callCosts.length === 0 ? (
            <div className="text-center py-8">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No call costs found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Call costs will appear here after calls are made.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {callCosts.map((call) => (
                <div
                  key={call.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            call.status
                          )}`}
                        >
                          {call.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(call.timestamp).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {call.phone_number}
                          </div>
                          <div className="text-xs text-gray-500">
                            User:{" "}
                            {users[call.user_id]?.full_name ||
                              users[call.user_id]?.email ||
                              "Unknown"}
                          </div>
                          {call.destination_country && (
                            <div className="text-xs text-gray-500">
                              Country: {call.destination_country}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Duration:</span>
                            <span className="font-medium">
                              {formatDuration(call.duration)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Voice Cost:</span>
                            <span className="font-medium text-blue-600">
                              {formatCost(call.voice_cost)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">SIP Trunking:</span>
                            <span className="font-medium text-purple-600">
                              {formatCost(call.sip_trunking_cost)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-semibold border-t pt-1">
                            <span className="text-gray-900">Total Cost:</span>
                            <span className="text-green-600">
                              {formatCost(call.total_cost)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {callCosts.length} calls • Last updated:{" "}
              {new Date().toLocaleString()}
            </div>
            <button
              onClick={fetchCallCosts}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallCostHistory;
