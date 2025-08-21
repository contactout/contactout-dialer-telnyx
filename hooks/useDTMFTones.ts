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
  const [volume, setVolume] = useState(0.3); // Default volume at 30%
  const [enabled, setEnabled] = useState(true); // Default enabled

  const initializeAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        console.log("Initializing AudioContext on user interaction");
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        // Resume the context
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current
            .resume()
            .then(() => {
              console.log("AudioContext initialized and resumed successfully");
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
      console.log("Attempting to play DTMF tone for digit:", digit);

      if (!DTMF_FREQUENCIES[digit]) {
        console.warn("Invalid digit for DTMF tone:", digit);
        return;
      }

      if (isPlayingRef.current) {
        console.log("DTMF tone already playing, skipping");
        return;
      }

      if (!enabled) {
        console.log("DTMF tones disabled, skipping");
        return;
      }

      try {
        if (!audioContextRef.current) {
          console.log("Creating new AudioContext");
          audioContextRef.current = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        }

        // Resume audio context if it's suspended (browser requirement)
        if (audioContextRef.current.state === "suspended") {
          console.log("AudioContext suspended, attempting to resume");
          audioContextRef.current
            .resume()
            .then(() => {
              console.log("AudioContext resumed successfully");
            })
            .catch((err) => {
              console.error("Failed to resume AudioContext:", err);
            });
        }

        const frequencies = DTMF_FREQUENCIES[digit];
        console.log("Playing DTMF tone with frequencies:", frequencies);

        const duration = 0.1; // 100ms tone duration
        const now = audioContextRef.current.currentTime;

        const oscillator1 = audioContextRef.current.createOscillator();
        const oscillator2 = audioContextRef.current.createOscillator();
        const gainNode = audioContextRef.current.createGain();

        oscillator1.frequency.setValueAtTime(frequencies[0], now);
        oscillator2.frequency.setValueAtTime(frequencies[1], now);
        oscillator1.type = "sine";
        oscillator2.type = "sine";

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(volume, now + duration - 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);

        oscillator1.start(now);
        oscillator2.start(now);
        oscillator1.stop(now + duration);
        oscillator2.stop(now + duration);

        isPlayingRef.current = true;
        console.log("DTMF tone started");

        setTimeout(() => {
          isPlayingRef.current = false;
          console.log("DTMF tone finished");
        }, duration * 1000);
      } catch (error) {
        console.error("Failed to play DTMF tone:", error);
        isPlayingRef.current = false;
      }
    },
    [volume, enabled]
  );

  const updateVolume = useCallback((newVolume: number) => {
    setVolume(newVolume);
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  const cleanup = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  return {
    playTone,
    cleanup,
    volume,
    updateVolume,
    enabled,
    toggleEnabled,
    initializeAudioContext,
  };
};
