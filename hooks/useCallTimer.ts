import { useState, useEffect, useRef, useCallback } from "react";

interface UseCallTimerReturn {
  ringingElapsed: number;
  activeElapsed: number;
  startRingingTimer: () => void;
  startActiveTimer: () => void;
  stopRingingTimer: () => void;
  stopActiveTimer: () => void;
  resetTimers: () => void;
  formatTime: (seconds: number) => string;
}

/**
 * Custom hook for managing call timers
 * Tracks elapsed time for ringing and active call states separately
 */
export const useCallTimer = (): UseCallTimerReturn => {
  const [ringingElapsed, setRingingElapsed] = useState(0);
  const [activeElapsed, setActiveElapsed] = useState(0);

  const ringingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringingStartTimeRef = useRef<number | null>(null);
  const activeStartTimeRef = useRef<number | null>(null);

  // Clear intervals on unmount
  useEffect(() => {
    return () => {
      if (ringingIntervalRef.current) {
        clearInterval(ringingIntervalRef.current);
      }
      if (activeIntervalRef.current) {
        clearInterval(activeIntervalRef.current);
      }
    };
  }, []);

  const startRingingTimer = useCallback(() => {
    // Stop any existing ringing timer
    if (ringingIntervalRef.current) {
      clearInterval(ringingIntervalRef.current);
    }

    ringingStartTimeRef.current = Date.now();
    setRingingElapsed(0);

    ringingIntervalRef.current = setInterval(() => {
      if (ringingStartTimeRef.current) {
        const elapsed = Math.floor(
          (Date.now() - ringingStartTimeRef.current) / 1000
        );
        setRingingElapsed(elapsed);
      }
    }, 1000);
  }, []);

  const startActiveTimer = useCallback(() => {
    // Stop any existing active timer
    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current);
    }

    activeStartTimeRef.current = Date.now();
    setActiveElapsed(0);

    activeIntervalRef.current = setInterval(() => {
      if (activeStartTimeRef.current) {
        const elapsed = Math.floor(
          (Date.now() - activeStartTimeRef.current) / 1000
        );
        setActiveElapsed(elapsed);
      }
    }, 1000);
  }, []);

  const stopRingingTimer = useCallback(() => {
    if (ringingIntervalRef.current) {
      clearInterval(ringingIntervalRef.current);
      ringingIntervalRef.current = null;
    }
    ringingStartTimeRef.current = null;
  }, []);

  const stopActiveTimer = useCallback(() => {
    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = null;
    }
    activeStartTimeRef.current = null;
  }, []);

  const resetTimers = useCallback(() => {
    stopRingingTimer();
    stopActiveTimer();
    setRingingElapsed(0);
    setActiveElapsed(0);
  }, [stopRingingTimer, stopActiveTimer]);

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }, []);

  return {
    ringingElapsed,
    activeElapsed,
    startRingingTimer,
    startActiveTimer,
    stopRingingTimer,
    stopActiveTimer,
    resetTimers,
    formatTime,
  };
};
