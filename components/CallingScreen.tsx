import React, { useEffect } from "react";
import { useCallAudio } from "@/hooks/useCallAudio";
import { useCallTimer } from "@/hooks/useCallTimer";
import { useRemoteAudioLevel } from "@/hooks/useRemoteAudioLevel";
import { detectCountry, formatPhoneNumber } from "@/lib/phoneNumberUtils";

interface CallingScreenProps {
  phoneNumber: string;
  onHangup: () => void;
  error?: string | null;
  onReturnToDialPad?: () => void;
  onRetry?: () => void;
  isConnecting?: boolean;
  isCallActive?: boolean;
  callState?: string;
  callDuration?: number;
  autoRedirectCountdown?: number | null;
  currentCall?: any;
}

const CallingScreen: React.FC<CallingScreenProps> = ({
  phoneNumber,
  onHangup,
  error,
  onReturnToDialPad,
  onRetry,
  isConnecting = false,
  isCallActive = false,
  callState = "",
  callDuration = 0,
  autoRedirectCountdown,
  currentCall,
}) => {
  // Use the comprehensive audio hook
  const { playCallAudio, stopAllAudio, initializeAudioContext } = useCallAudio({
    volume: 0.4,
    enabled: true,
    ringtoneVolume: 0.3,
    statusVolume: 0.25,
    ringtoneStyle: "modern", // Use modern ringtone by default
  });

  // Use the call timer hook
  const {
    ringingElapsed,
    activeElapsed,
    startRingingTimer,
    startActiveTimer,
    stopRingingTimer,
    stopActiveTimer,
    resetTimers,
    formatTime,
  } = useCallTimer();

  // Use the remote audio level hook for visual feedback
  const { audioLevel, isSpeaking } = useRemoteAudioLevel(
    currentCall,
    isCallActive
  );

  // Initialize audio context
  useEffect(() => {
    initializeAudioContext();
  }, [initializeAudioContext]);

  // Audio playback based on call state
  useEffect(() => {
    if (error) {
      // Stop any ongoing audio
      stopAllAudio();

      // Play error tone for specific error types
      if (
        error.includes("failed") ||
        error.includes("invalid") ||
        error.includes("unreachable")
      ) {
        // Small delay to ensure smooth transition
        const timer = setTimeout(() => {
          playCallAudio("error");
        }, 200);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (!isConnecting) {
      stopAllAudio();
      return;
    }

    // Play appropriate audio based on call state
    if (callState === "ringing") {
      playCallAudio("ringing");
    } else if (callState === "trying" || callState === "connecting") {
      // For international calls, play ringing tone during "trying" state
      // as they may not transition to "ringing" state
      playCallAudio("ringing");
    }

    // Cleanup function
    return () => {
      stopAllAudio();
    };
  }, [error, isConnecting, callState, playCallAudio, stopAllAudio]);

  // Play call connected sound when call becomes active
  useEffect(() => {
    if (isCallActive && callState === "connected") {
      console.log(
        "📞 CallingScreen: Call is active and connected, playing connected sound"
      );
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        playCallAudio("connected");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCallActive, callState, playCallAudio]);

  // Play voice mail sound when call goes to voice mail
  useEffect(() => {
    if (isCallActive && callState === "voicemail") {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        playCallAudio("voicemail");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCallActive, callState, playCallAudio]);

  // Play call ended sound when call ends
  useEffect(() => {
    if (!isCallActive && !isConnecting && callState !== "idle") {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        playCallAudio("ended");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCallActive, isConnecting, callState, playCallAudio]);

  // Timer management based on call states
  useEffect(() => {
    // Handle ringing timer
    if (isConnecting && (callState === "ringing" || callState === "early")) {
      startRingingTimer();
    } else {
      stopRingingTimer();
    }

    // Handle active call timer
    if (isCallActive && callState === "connected") {
      startActiveTimer();
    } else {
      stopActiveTimer();
    }

    // Reset all timers when call ends or error occurs
    if (error || (!isConnecting && !isCallActive && callState === "idle")) {
      resetTimers();
    }
  }, [
    isConnecting,
    isCallActive,
    callState,
    error,
    startRingingTimer,
    stopRingingTimer,
    startActiveTimer,
    stopActiveTimer,
    resetTimers,
  ]);

  // Get call state for visual styling
  const getCallStateInfo = () => {
    if (error) return { color: "red", animation: "none", text: error };
    if (isCallActive) {
      if (callState === "voicemail")
        return { color: "orange", animation: "none", text: "Voice Mail" };
      if (callState === "connected")
        return { color: "green", animation: "none", text: "" };
      return { color: "green", animation: "none", text: "" };
    }
    if (isConnecting) {
      return { color: "blue", animation: "pulse", text: "" };
    }
    return { color: "gray", animation: "none", text: "" };
  };

  const callStateInfo = getCallStateInfo();

  return (
    <div className="w-full max-w-sm mx-auto text-center flex flex-col justify-center min-h-[600px]">
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
          <div className="text-sm font-medium mb-3">{error}</div>

          {/* Auto-redirect countdown */}
          {autoRedirectCountdown && autoRedirectCountdown > 0 && (
            <div className="mb-3 text-xs text-blue-600">
              Redirecting in {autoRedirectCountdown}s...
            </div>
          )}

          <div className="flex gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Retry
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

      {/* Main Call Display - iPhone Style */}
      <div className="mb-8">
        {/* Contact Avatar (Country Flag) */}
        <div className="mb-8">
          {(() => {
            const country = detectCountry(phoneNumber);
            if (country) {
              return (
                <div className="w-24 h-24 bg-gray-100 rounded-full mx-auto flex items-center justify-center text-4xl shadow-sm">
                  {country.flag}
                </div>
              );
            }
            return (
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto flex items-center justify-center">
                <svg
                  className="w-12 h-12 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
              </div>
            );
          })()}
        </div>

        {/* Phone Number - Hero Element */}
        <div className="mb-8">
          <div className="text-3xl font-light text-gray-900 tracking-wide">
            {formatPhoneNumber(phoneNumber) || phoneNumber}
          </div>
        </div>

        {/* Call State Visual Indicator */}
        <div className="mb-8">
          <div
            className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center relative ${
              callStateInfo.color === "red"
                ? "bg-red-500"
                : callStateInfo.color === "green"
                ? "bg-green-500"
                : callStateInfo.color === "orange"
                ? "bg-orange-500"
                : "bg-blue-500"
            }`}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>

            {/* Pulsing animation for connecting/ringing */}
            {callStateInfo.animation === "pulse" && (
              <div
                className={`absolute inset-0 w-16 h-16 rounded-full opacity-30 animate-ping ${
                  callStateInfo.color === "blue" ? "bg-blue-500" : "bg-current"
                }`}
              ></div>
            )}
          </div>
        </div>

        {/* Call Duration - Only show when connected */}
        {isCallActive && callState === "connected" && activeElapsed > 0 && (
          <div className="mb-8">
            <div className="text-2xl font-light text-gray-600">
              {formatTime(activeElapsed)}
            </div>
          </div>
        )}

        {/* Minimal Status Text - Only for errors or voice mail */}
        {callStateInfo.text && (
          <div className="mb-6">
            <div
              className={`text-sm font-medium ${
                callStateInfo.color === "red"
                  ? "text-red-600"
                  : callStateInfo.color === "orange"
                  ? "text-orange-600"
                  : "text-gray-600"
              }`}
            >
              {callStateInfo.text}
            </div>
          </div>
        )}

        {/* Subtle Remote Speaker Indicator */}
        {isCallActive && (
          <div className="mb-6 flex items-center justify-center">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                {[1, 2, 3].map((bar) => (
                  <div
                    key={bar}
                    className={`w-1 h-4 rounded-full transition-all duration-200 ${
                      isSpeaking ? "bg-green-500" : "bg-gray-300"
                    }`}
                    style={{
                      animation: isSpeaking
                        ? `audioBar${bar} 1s ease-in-out infinite`
                        : "none",
                      animationDelay: `${bar * 0.1}s`,
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hang Up Button - iPhone Style */}
      <button
        onClick={onHangup}
        className="w-20 h-20 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center mx-auto transform active:scale-95"
      >
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          <path
            d="M21 3L3 21"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default CallingScreen;
