import { useRef, useCallback } from "react";

export const useSharedAudio = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        // Resume if suspended
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume();
        }
      } catch (error) {
        console.error("Failed to create audio context:", error);
        return null;
      }
    }
    return audioContextRef.current;
  }, []);

  const resumeAudioContext = useCallback(async () => {
    const context = getAudioContext();
    if (context && context.state === "suspended") {
      try {
        await context.resume();
      } catch (error) {
        console.error("Failed to resume audio context:", error);
      }
    }
  }, [getAudioContext]);

  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (error) {
        console.error("Error closing audio context:", error);
      }
    }
  }, []);

  return {
    getAudioContext,
    resumeAudioContext,
    cleanup,
  };
};
