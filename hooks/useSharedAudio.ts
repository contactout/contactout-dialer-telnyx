import { useRef, useCallback, useEffect } from "react";

export const useSharedAudio = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isInitializedRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && !isInitializedRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        console.log(
          "🎵 Audio context created, state:",
          audioContextRef.current.state
        );
        isInitializedRef.current = true;
      } catch (error) {
        console.error("❌ Failed to create audio context:", error);
        return null;
      }
    }
    return audioContextRef.current;
  }, []);

  const ensureAudioContextActive = useCallback(async () => {
    const context = getAudioContext();
    if (!context) {
      console.warn("⚠️ No audio context available");
      return false;
    }

    try {
      if (context.state === "suspended") {
        console.log("🎵 Audio context suspended, attempting to resume...");
        await context.resume();
        console.log("✅ Audio context resumed, new state:", context.state);
      }
      return context.state === "running";
    } catch (error) {
      console.error("❌ Failed to resume audio context:", error);
      return false;
    }
  }, [getAudioContext]);

  const resumeAudioContext = useCallback(async () => {
    return await ensureAudioContextActive();
  }, [ensureAudioContextActive]);

  const isAudioContextActive = useCallback(() => {
    const context = audioContextRef.current;
    return context && context.state === "running";
  }, []);

  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      try {
        console.log("🧹 Cleaning up audio context");
        audioContextRef.current.close();
        audioContextRef.current = null;
        isInitializedRef.current = false;
      } catch (error) {
        console.error("❌ Error cleaning up audio context:", error);
      }
    }
  }, []);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    getAudioContext,
    resumeAudioContext,
    ensureAudioContextActive,
    isAudioContextActive,
    cleanup,
  };
};
