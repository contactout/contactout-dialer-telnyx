import { useCallback, useRef, useState } from "react";

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const isPlayingRef = useRef(false);
  const [volume, setVolume] = useState(0.4); // Default volume at 40% for better audibility
  const [enabled, setEnabled] = useState(true); // Default enabled

  const initializeAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        // Resume the context
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current
            .resume()
            .then(() => {
              // AudioContext initialized successfully
            })
            .catch((err) => {
              console.error(
                "Failed to resume AudioContext during initialization:",
                err
              );
            });
        }
      }
    } catch (error) {
      console.error("Failed to initialize AudioContext:", error);
    }
  }, []);

  const playTone = useCallback(
    (digit: string) => {
      if (!DTMF_FREQUENCIES[digit]) {
        console.warn("Invalid digit for DTMF tone:", digit);
        return;
      }

      if (isPlayingRef.current) {
        return;
      }

      if (!enabled) {
        return;
      }

      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        }

        // Resume audio context if it's suspended (browser requirement)
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current
            .resume()
            .then(() => {
              // AudioContext resumed successfully
            })
            .catch((err) => {
              console.error("Failed to resume AudioContext:", err);
            });
        }

        const frequencies = DTMF_FREQUENCIES[digit];

        // Enhanced DTMF tone with better timing and envelope
        const duration = 0.12; // 120ms tone duration (standard DTMF duration)
        const now = audioContextRef.current.currentTime;

        // Create two oscillators for the dual-tone DTMF
        const oscillator1 = audioContextRef.current.createOscillator();
        const oscillator2 = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();

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
        gainNode.connect(audioContextRef.current.destination);

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
        console.error("Failed to play DTMF tone:", error);
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

  // Cleanup function to properly dispose of audio context
  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // Test function to verify DTMF tones are working
  const testDTMFTone = useCallback(() => {
    if (enabled) {
      playTone("1"); // Play a test tone
    }
  }, [enabled, playTone]);

  return {
    playTone,
    cleanup,
    volume,
    updateVolume,
    enabled,
    toggleEnabled,
    initializeAudioContext,
    testDTMFTone, // Add test function for debugging
  };
};
