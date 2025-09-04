import { useCallback, useRef, useState } from "react";
import { useSharedAudio } from "./useSharedAudio";

const DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

export const useDTMFTones = () => {
  const { getAudioContext, resumeAudioContext, ensureAudioContextActive } =
    useSharedAudio();
  const isPlayingRef = useRef(false);
  const toneQueueRef = useRef<string[]>([]);
  const isProcessingQueueRef = useRef(false);
  const [volume, setVolume] = useState(0.4); // Default volume at 40% for better audibility
  const [enabled, setEnabled] = useState(true); // Default enabled

  const initializeAudioContext = useCallback(() => {
    try {
      const context = getAudioContext();
      if (context) {
        resumeAudioContext();
      }
    } catch (error) {}
  }, [getAudioContext, resumeAudioContext]);

  // Process DTMF tone queue to prevent overlaps
  const processToneQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || toneQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;

    while (toneQueueRef.current.length > 0) {
      const digit = toneQueueRef.current.shift();
      if (digit) {
        await playToneInternal(digit);
        // Wait for tone to complete before playing next
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }

    isProcessingQueueRef.current = false;
  }, []);

  const playTone = useCallback(
    async (digit: string) => {
      if (!DTMF_FREQUENCIES[digit]) {
        console.warn(`⚠️ Invalid DTMF digit: ${digit}`);
        return;
      }

      if (!enabled) {
        console.log(`🔇 DTMF disabled, ignoring digit: ${digit}`);
        return;
      }

      // Add to queue instead of playing immediately
      toneQueueRef.current.push(digit);
      console.log(
        `📞 DTMF digit queued: ${digit}, queue length: ${toneQueueRef.current.length}`
      );

      // Process queue if not already processing
      if (!isProcessingQueueRef.current) {
        processToneQueue();
      }
    },
    [enabled, processToneQueue]
  );

  const playToneInternal = useCallback(
    async (digit: string) => {
      if (isPlayingRef.current) {
        console.warn(`⚠️ DTMF tone already playing, skipping: ${digit}`);
        return;
      }

      try {
        const audioContext = getAudioContext();
        if (!audioContext) {
          console.warn("⚠️ No audio context available for DTMF tone");
          return;
        }

        // Ensure audio context is active
        const isActive = await ensureAudioContextActive();
        if (!isActive) {
          console.warn("⚠️ Audio context not active, cannot play DTMF tone");
          return;
        }

        const frequencies = DTMF_FREQUENCIES[digit];

        // Enhanced DTMF tone with better timing and envelope
        const duration = 0.12; // 120ms tone duration (standard DTMF duration)
        const now = audioContext.currentTime;

        // Create two oscillators for the dual-tone DTMF
        const oscillator1 = audioContext.createOscillator();
        const oscillator2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Set frequencies for the two tones
        oscillator1.frequency.setValueAtTime(frequencies[0], now);
        oscillator2.frequency.setValueAtTime(frequencies[1], now);

        // Use sine wave for clean, traditional DTMF sound
        oscillator1.type = "sine";
        oscillator2.type = "sine";

        // Create smooth envelope for natural sound
        // Quick attack, hold, then smooth release
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.005); // Quick attack (5ms)
        gainNode.gain.setValueAtTime(volume, now + duration - 0.015); // Hold
        gainNode.gain.linearRampToValueAtTime(0, now + duration); // Smooth release (15ms)

        // Connect oscillators to gain node, then to destination
        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Start and stop oscillators
        oscillator1.start(now);
        oscillator2.start(now);
        oscillator1.stop(now + duration);
        oscillator2.stop(now + duration);

        // Set playing flag to prevent overlapping tones
        isPlayingRef.current = true;

        // Reset playing flag after tone completes
        setTimeout(() => {
          isPlayingRef.current = false;
        }, duration * 1000);
      } catch (error) {
        isPlayingRef.current = false;
      }
    },
    [volume, enabled]
  );

  // Enhanced volume control with validation
  const updateVolume = useCallback((newVolume: number) => {
    // Ensure volume is within valid range (0.0 to 1.0)
    const clampedVolume = Math.max(0.0, Math.min(1.0, newVolume));
    setVolume(clampedVolume);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  // Clear DTMF tone queue
  const clearToneQueue = useCallback(() => {
    toneQueueRef.current = [];
    isProcessingQueueRef.current = false;
    console.log("🧹 DTMF tone queue cleared");
  }, []);

  // Get current queue status
  const getQueueStatus = useCallback(() => {
    return {
      queueLength: toneQueueRef.current.length,
      isProcessing: isProcessingQueueRef.current,
      isPlaying: isPlayingRef.current,
    };
  }, []);

  // Cleanup function to properly dispose of audio context and clear queue
  const cleanup = useCallback(() => {
    clearToneQueue();
    isPlayingRef.current = false;
    // Cleanup is handled by the shared audio context
  }, [clearToneQueue]);

  // Test function to verify DTMF tones are working
  const testDTMFTone = useCallback(() => {
    if (enabled) {
      playTone("1"); // Play a test tone
    }
  }, [enabled, playTone]);

  return {
    playTone,
    clearToneQueue,
    getQueueStatus,
    cleanup,
    volume,
    updateVolume,
    enabled,
    toggleEnabled,
    initializeAudioContext,
    testDTMFTone, // Add test function for debugging
  };
};
