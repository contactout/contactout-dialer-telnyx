import React, { useEffect, useRef } from "react";

// TypeScript declarations for Web Audio API
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface CallingScreenProps {
  phoneNumber: string;
  onHangup: () => void;
  error?: string | null;
  onReturnToDialPad?: () => void;
  onRetry?: () => void;
}

const CallingScreen: React.FC<CallingScreenProps> = ({
  phoneNumber,
  onHangup,
  error,
  onReturnToDialPad,
  onRetry,
}) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Create audio context and start ringtone
    const startRingtone = () => {
      try {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
        gainNodeRef.current = audioContextRef.current.createGain();

        // Set up proper phone ringtone pattern
        const playRingtone = () => {
          if (!audioContextRef.current || !gainNodeRef.current) return;

          const now = audioContextRef.current.currentTime;

          // Create two oscillators for a two-tone ringtone (like traditional phones)
          const osc1 = audioContextRef.current.createOscillator();
          const osc2 = audioContextRef.current.createOscillator();
          const gain = audioContextRef.current.createGain();

          // Connect oscillators to gain node, then to destination
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(audioContextRef.current.destination);

          // Set frequencies for two-tone ringtone (common phone frequencies)
          osc1.frequency.setValueAtTime(480, now); // Lower tone
          osc2.frequency.setValueAtTime(620, now); // Higher tone
          osc1.type = "sine";
          osc2.type = "sine";

          // Create envelope for the ringtone pattern
          // Ringtone should be on for about 1 second, then off for 2 seconds
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.05); // Fade in
          gain.gain.setValueAtTime(0.25, now + 0.95); // Hold
          gain.gain.linearRampToValueAtTime(0, now + 1.0); // Fade out

          // Start and stop oscillators
          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.0);
          osc2.stop(now + 1.0);
        };

        // Play ringtone every 3 seconds (1 second ring, 2 seconds silence)
        intervalRef.current = setInterval(playRingtone, 3000);

        // Play first ringtone immediately
        playRingtone();
      } catch (error) {
        console.error("Failed to create audio context:", error);
      }
    };

    startRingtone();

    // Cleanup: stop audio when component unmounts
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      // Note: We don't need to stop individual oscillators as they auto-cleanup
      // and the main oscillatorRef was never started
    };
  }, []);

  return (
    <div className="w-full max-w-sm mx-auto text-center">
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
          <div className="mb-3">
            <svg
              className="w-6 h-6 mx-auto text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="text-sm font-medium mb-3">{error}</div>
          <div className="flex gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Retry Call
              </button>
            )}
            {onReturnToDialPad && (
              <button
                onClick={onReturnToDialPad}
                className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Return to Dial Pad
              </button>
            )}
          </div>
        </div>
      )}

      {/* Calling Animation */}
      <div className="mb-8">
        <div className="w-24 h-24 bg-blue-500 rounded-full mx-auto mb-4 flex items-center justify-center">
          <svg
            className="w-12 h-12 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
        </div>

        {/* Pulsing animation */}
        <div className="relative">
          <div className="absolute inset-0 w-24 h-24 bg-blue-500 rounded-full mx-auto opacity-75 animate-ping"></div>
          <div
            className="absolute inset-0 w-24 h-24 bg-blue-500 rounded-full mx-auto opacity-50 animate-ping"
            style={{ animationDelay: "0.5s" }}
          ></div>
        </div>
      </div>

      {/* Phone Number Display */}
      <div className="mb-6">
        <div className="text-lg text-gray-600 mb-2">Calling...</div>
        <div className="text-2xl font-mono text-gray-800">{phoneNumber}</div>
      </div>

      {/* Hang Up Button */}
      <button
        onClick={onHangup}
        className="w-20 h-20 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg flex items-center justify-center mx-auto"
      >
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          <path
            d="M21 3L3 21"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Call Status */}
      <div className="mt-6 text-sm text-gray-500">Waiting for answer...</div>
    </div>
  );
};

export default CallingScreen;
