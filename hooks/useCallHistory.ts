import { useState, useEffect, useCallback } from "react";

export interface CallRecord {
  phoneNumber: string;
  timestamp: number;
  status: "completed" | "failed" | "missed" | "incoming";
}

const STORAGE_KEY = "call_history";
const MAX_HISTORY_SIZE = 10; // Keep last 10 calls

export const useCallHistory = () => {
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  // Load call history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCallHistory(parsed);
      }
    } catch (error) {
      console.error("Failed to load call history from localStorage:", error);
    }
  }, []);

  // Save call history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(callHistory));
    } catch (error) {
      console.error("Failed to save call history to localStorage:", error);
    }
  }, [callHistory]);

  // Add a new call to history
  const addCall = useCallback(
    (phoneNumber: string, status: CallRecord["status"]) => {
      const newCall: CallRecord = {
        phoneNumber,
        timestamp: Date.now(),
        status,
      };

      setCallHistory((prev) => {
        // Remove duplicate entries for the same number
        const filtered = prev.filter(
          (call) => call.phoneNumber !== phoneNumber
        );

        // Add new call at the beginning
        const updated = [newCall, ...filtered];

        // Keep only the last MAX_HISTORY_SIZE calls
        return updated.slice(0, MAX_HISTORY_SIZE);
      });
    },
    []
  );

  // Get the last dialed number
  const getLastDialed = useCallback(() => {
    return callHistory.length > 0 ? callHistory[0].phoneNumber : null;
  }, [callHistory]);

  // Clear all call history
  const clearHistory = useCallback(() => {
    setCallHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Failed to clear call history from localStorage:", error);
    }
  }, []);

  // Remove a specific call from history
  const removeCall = useCallback((timestamp: number) => {
    setCallHistory((prev) =>
      prev.filter((call) => call.timestamp !== timestamp)
    );
  }, []);

  // Format timestamp for display
  const formatTimestamp = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
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
    addCall,
    getLastDialed,
    clearHistory,
    removeCall,
    formatTimestamp,
  };
};
