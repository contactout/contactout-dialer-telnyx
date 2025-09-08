import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface CallRecord {
  id: string;
  phone_number: string;
  timestamp: string;
  status: "completed" | "failed" | "missed" | "incoming" | "voicemail";
  duration?: number;
  voice_cost?: number;
  sip_trunking_cost?: number;
  total_cost?: number;
  currency?: string;
  destination_country?: string;
}

export const useCallHistory = () => {
  const { user } = useAuth();
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch call history from Supabase
  const fetchCallHistory = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("calls")
        .select("*")
        .eq("user_id", user.id)
        .order("timestamp", { ascending: false })
        .limit(20); // Keep last 20 calls for performance

      if (fetchError) throw fetchError;

      setCallHistory(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load call history");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Load call history on mount and when user changes
  useEffect(() => {
    fetchCallHistory();
  }, [fetchCallHistory]);

  // Refresh call history
  const refreshHistory = useCallback(() => {
    fetchCallHistory();
  }, [fetchCallHistory]);

  // Get the last dialed number
  const getLastDialed = useCallback(() => {
    return callHistory.length > 0 ? callHistory[0].phone_number : null;
  }, [callHistory]);

  // Clear all call history (remove from database)
  const clearHistory = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error: deleteError } = await supabase
        .from("calls")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setCallHistory([]);
    } catch (err: any) {
      setError(err.message || "Failed to clear call history");
    }
  }, [user?.id]);

  // Remove a specific call from history
  const removeCall = useCallback(async (callId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from("calls")
        .delete()
        .eq("id", callId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setCallHistory((prev) => prev.filter((call) => call.id !== callId));
    } catch (err: any) {
      setError(err.message || "Failed to remove call");
    }
  }, []);

  // Format timestamp for display
  const formatTimestamp = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now ";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  }, []);

  return {
    callHistory,
    loading,
    error,
    addCall: refreshHistory, // Since calls are tracked automatically, just refresh
    getLastDialed,
    clearHistory,
    removeCall,
    formatTimestamp,
    refreshHistory,
  };
};
