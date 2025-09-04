import { useCallback, useRef, useEffect } from "react";
import { useSharedAudio } from "./useSharedAudio";

// Audio feedback types for different call states
export type CallAudioType =
  | "ringing"
  | "connecting"
  | "connected"
  | "voicemail"
  | "ended"
  | "failed"
  | "busy"
  | "error";

export interface CallAudioConfig {
  volume: number;
  enabled: boolean;
  ringtoneVolume: number;
  statusVolume: number;
  ringtoneStyle?: "classic" | "modern" | "traditional";
}

export const useCallAudio = (
  config: CallAudioConfig = {
    volume: 0.4,
    enabled: true,
    ringtoneVolume: 0.3,
    statusVolume: 0.25,
    ringtoneStyle: "modern",
  }
) => {
  const {
    getAudioContext,
    resumeAudioContext,
    ensureAudioContextActive,
    isAudioContextActive,
  } = useSharedAudio();
  const ringtoneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const busyToneIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const errorToneIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio context with proper error handling
  const initializeAudioContext = useCallback(async () => {
    try {
      const context = getAudioContext();
      if (context) {
        const isActive = await ensureAudioContextActive();
        if (!isActive) {
          console.warn("⚠️ Audio context could not be activated");
        }
        return isActive;
      }
      return false;
    } catch (error) {
      console.error("❌ Failed to initialize audio context:", error);
      return false;
    }
  }, [getAudioContext, ensureAudioContextActive]);

  // Cleanup all audio
  const cleanupAudio = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (busyToneIntervalRef.current) {
      clearInterval(busyToneIntervalRef.current);
      busyToneIntervalRef.current = null;
    }
    if (errorToneIntervalRef.current) {
      clearInterval(errorToneIntervalRef.current);
      errorToneIntervalRef.current = null;
    }
  }, []);

  // Classic phone ringtone (2-tone alternating pattern)
  const playClassicRingtone = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Modern ringtone frequencies that sound more authentic
    const freq1 = 440; // A4 note (more pleasant)
    const freq2 = 554; // C#5 note (harmonious with A4)

    // Create oscillators for the two-tone ringtone
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Set frequencies and waveform type
    osc1.frequency.setValueAtTime(freq1, now);
    osc2.frequency.setValueAtTime(freq2, now);
    osc1.type = "sine";
    osc2.type = "sine";

    // Connect audio nodes
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    // Authentic ringtone pattern: 2 seconds on, 4 seconds off
    // This matches traditional phone ringtone timing
    const ringDuration = 2.0; // 2 seconds of ringing
    const silenceDuration = 4.0; // 4 seconds of silence
    const totalCycle = ringDuration + silenceDuration;

    // Create smooth envelope for natural sound with proper attack and decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.ringtoneVolume, now + 0.1); // Gentle fade in
    gain.gain.setValueAtTime(config.ringtoneVolume, now + ringDuration - 0.15); // Hold volume
    gain.gain.linearRampToValueAtTime(0, now + ringDuration); // Gentle fade out

    // Start and stop oscillators
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + ringDuration);
    osc2.stop(now + ringDuration);

    return totalCycle;
  }, [config.enabled, config.ringtoneVolume]);

  // Alternative modern ringtone (more pleasant frequencies)
  const playModernRingtone = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Pleasant musical frequencies for modern ringtone
    const freq1 = 523; // C5 note
    const freq2 = 659; // E5 note (major third - harmonious)

    // Create oscillators for the two-tone ringtone
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Set frequencies and waveform type
    osc1.frequency.setValueAtTime(freq1, now);
    osc2.frequency.setValueAtTime(freq2, now);
    osc1.type = "sine";
    osc2.type = "sine";

    // Connect audio nodes
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    // Modern ringtone pattern: 1.5 seconds on, 3 seconds off
    const ringDuration = 1.5; // 1.5 seconds of ringing
    const silenceDuration = 3.0; // 3 seconds of silence
    const totalCycle = ringDuration + silenceDuration;

    // Create smooth envelope with gentle attack and decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.ringtoneVolume, now + 0.08); // Quick fade in
    gain.gain.setValueAtTime(config.ringtoneVolume, now + ringDuration - 0.12); // Hold volume
    gain.gain.linearRampToValueAtTime(0, now + ringDuration); // Gentle fade out

    // Start and stop oscillators
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + ringDuration);
    osc2.stop(now + ringDuration);

    return totalCycle;
  }, [config.enabled, config.ringtoneVolume]);

  // Traditional North American ringtone (480Hz + 620Hz with proper timing)
  const playTraditionalRingtone = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Standard North American ringtone frequencies
    const freq1 = 480; // Lower frequency (Hz)
    const freq2 = 620; // Higher frequency (Hz)

    // Create oscillators for the two-tone ringtone
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    // Set frequencies and waveform type
    osc1.frequency.setValueAtTime(freq1, now);
    osc2.frequency.setValueAtTime(freq2, now);
    osc1.type = "sine";
    osc2.type = "sine";

    // Connect audio nodes
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    // Traditional ringtone pattern: 2 seconds on, 4 seconds off
    const ringDuration = 2.0; // 2 seconds of ringing
    const silenceDuration = 4.0; // 4 seconds of silence
    const totalCycle = ringDuration + silenceDuration;

    // Create smooth envelope for natural sound
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.ringtoneVolume, now + 0.1); // Gentle fade in
    gain.gain.setValueAtTime(config.ringtoneVolume, now + ringDuration - 0.15); // Hold volume
    gain.gain.linearRampToValueAtTime(0, now + ringDuration); // Gentle fade out

    // Start and stop oscillators
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + ringDuration);
    osc2.stop(now + ringDuration);

    return totalCycle;
  }, [config.enabled, config.ringtoneVolume]);

  // Busy tone (when call fails or number is busy)
  const playBusyTone = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Busy tone: 480Hz + 620Hz alternating every 0.5 seconds
    const freq1 = 480;
    const freq2 = 620;

    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc1.frequency.setValueAtTime(freq1, now);
    osc2.frequency.setValueAtTime(freq2, now);
    osc1.type = "sine";
    osc2.type = "sine";

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioContext.destination);

    // Busy tone pattern: 0.5s on, 0.5s off
    const toneDuration = 0.5;
    const silenceDuration = 0.5;
    const totalCycle = toneDuration + silenceDuration;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.statusVolume, now + 0.01);
    gain.gain.setValueAtTime(config.statusVolume, now + toneDuration - 0.01);
    gain.gain.linearRampToValueAtTime(0, now + toneDuration);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + toneDuration);
    osc2.stop(now + toneDuration);

    return totalCycle;
  }, [config.enabled, config.statusVolume]);

  // Error tone (for connection failures)
  const playErrorTone = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Error tone: three descending beeps
    const frequencies = [800, 600, 400];
    const beepDuration = 0.2;
    const silenceBetweenBeeps = 0.1;

    frequencies.forEach((freq, index) => {
      const startTime = now + index * (beepDuration + silenceBetweenBeeps);

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.frequency.setValueAtTime(freq, startTime);
      osc.type = "sine";

      osc.connect(gain);
      gain.connect(audioContext.destination);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(config.statusVolume, startTime + 0.01);
      gain.gain.setValueAtTime(
        config.statusVolume,
        startTime + beepDuration - 0.01
      );
      gain.gain.linearRampToValueAtTime(0, startTime + beepDuration);

      osc.start(startTime);
      osc.stop(startTime + beepDuration);
    });
  }, [config.enabled, config.statusVolume]);

  // Call connected sound (when call is answered)
  const playCallConnectedSound = useCallback(async () => {
    if (!config.enabled) return;

    const audioContext = getAudioContext();
    if (!audioContext) {
      console.warn("⚠️ No audio context available for connected sound");
      return;
    }

    // Ensure audio context is active before playing
    const isActive = await ensureAudioContextActive();
    if (!isActive) {
      console.warn("⚠️ Audio context not active, cannot play connected sound");
      return;
    }

    try {
      const now = audioContext.currentTime;

      // Two ascending tones to indicate success
      const freq1 = 800;
      const freq2 = 1000;

      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc1.frequency.setValueAtTime(freq1, now);
      osc2.frequency.setValueAtTime(freq2, now + 0.1);
      osc1.type = "sine";
      osc2.type = "sine";

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioContext.destination);

      // First tone
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(config.statusVolume, now + 0.01);
      gain.gain.setValueAtTime(config.statusVolume, now + 0.09);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);

      // Second tone
      gain.gain.setValueAtTime(0, now + 0.1);
      gain.gain.linearRampToValueAtTime(config.statusVolume, now + 0.11);
      gain.gain.setValueAtTime(config.statusVolume, now + 0.19);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);

      osc1.start(now);
      osc1.stop(now + 0.1);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.2);
    } catch (error) {}
  }, [config.enabled, config.statusVolume]);

  // Call ended sound
  const playCallEndedSound = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    try {
      const now = audioContext.currentTime;

      // Two descending tones to indicate call end
      const freq1 = 1000;
      const freq2 = 600;

      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc1.frequency.setValueAtTime(freq1, now);
      osc2.frequency.setValueAtTime(freq2, now + 0.1);
      osc1.type = "sine";
      osc2.type = "sine";

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioContext.destination);

      // First tone
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(config.statusVolume, now + 0.01);
      gain.gain.setValueAtTime(config.statusVolume, now + 0.09);
      gain.gain.linearRampToValueAtTime(0, now + 0.1);

      // Second tone
      gain.gain.setValueAtTime(0, now + 0.1);
      gain.gain.linearRampToValueAtTime(config.statusVolume, now + 0.11);
      gain.gain.setValueAtTime(config.statusVolume, now + 0.19);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);

      osc1.start(now);
      osc1.stop(now + 0.1);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.2);
    } catch (error) {}
  }, [config.enabled, config.statusVolume]);

  // Connecting sound (softer than ringtone)
  const playConnectingSound = useCallback(() => {
    const audioContext = getAudioContext();
    if (!audioContext || !config.enabled) return;

    const now = audioContext.currentTime;

    // Single soft tone to indicate connecting
    const freq = 600;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.frequency.setValueAtTime(freq, now);
    osc.type = "sine";

    osc.connect(gain);
    gain.connect(audioContext.destination);

    // Soft connecting sound
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(config.statusVolume * 0.5, now + 0.01);
    gain.gain.setValueAtTime(config.statusVolume * 0.5, now + 0.19);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.2);
  }, [config.enabled, config.statusVolume]);

  // Main function to play appropriate audio for call state
  const playCallAudio = useCallback(
    (audioType: CallAudioType) => {
      if (!config.enabled) return;

      // Cleanup any existing audio first
      cleanupAudio();

      switch (audioType) {
        case "ringing":
          let cycleDuration: number | undefined;
          switch (config.ringtoneStyle) {
            case "classic":
              cycleDuration = playClassicRingtone();
              break;
            case "traditional":
              cycleDuration = playTraditionalRingtone();
              break;
            case "modern":
            default:
              cycleDuration = playModernRingtone();
              break;
          }

          if (cycleDuration) {
            ringtoneIntervalRef.current = setInterval(() => {
              switch (config.ringtoneStyle) {
                case "classic":
                  playClassicRingtone();
                  break;
                case "traditional":
                  playTraditionalRingtone();
                  break;
                case "modern":
                default:
                  playModernRingtone();
                  break;
              }
            }, cycleDuration * 1000);
          }
          break;

        case "connecting":
          playConnectingSound();
          break;

        case "connected":
          playCallConnectedSound();
          break;

        case "voicemail":
          // Play a distinctive sound for voice mail
          playCallConnectedSound(); // Use connected sound for now, could be customized
          break;

        case "ended":
          playCallEndedSound();
          break;

        case "failed":
        case "busy":
          const busyCycle = playBusyTone();
          if (busyCycle) {
            busyToneIntervalRef.current = setInterval(() => {
              playBusyTone();
            }, busyCycle * 1000);
          }
          break;

        case "error":
          playErrorTone();
          break;

        default:
          break;
      }
    },
    [
      config.enabled,
      cleanupAudio,
      playClassicRingtone,
      playModernRingtone,
      playTraditionalRingtone,
      playConnectingSound,
      playCallConnectedSound,
      playCallEndedSound,
      playBusyTone,
      playErrorTone,
    ]
  );

  // Stop all audio
  const stopAllAudio = useCallback(() => {
    cleanupAudio();
  }, [cleanupAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    playCallAudio,
    stopAllAudio,
    initializeAudioContext,
    cleanupAudio,
    // Individual sound functions for direct control
    playClassicRingtone,
    playModernRingtone,
    playTraditionalRingtone,
    playBusyTone,
    playErrorTone,
    playCallConnectedSound,
    playCallEndedSound,
    playConnectingSound,
  };
};
