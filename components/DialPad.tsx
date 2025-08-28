import React, { useState } from "react";
import { useDTMFTones } from "@/hooks/useDTMFTones";

interface DialPadProps {
  phoneNumber: string;
  onDigitPress: (digit: string) => void;
  onCall: () => void;
  onHangup: () => void;
  onClear: () => void;
  isCallActive: boolean;
  isConnecting: boolean;
  isInitializing?: boolean;
  isConnected?: boolean;
  hasMicrophoneAccess?: boolean;
}

const DialPad: React.FC<DialPadProps> = ({
  phoneNumber,
  onDigitPress,
  onCall,
  onHangup,
  onClear,
  isCallActive,
  isConnecting,
  isInitializing = false,
  isConnected = false,
  hasMicrophoneAccess = false,
}) => {
  const { playTone, volume, enabled, initializeAudioContext } = useDTMFTones();

  const handleDigitClick = (digit: string) => {
    // Initialize audio context on first user interaction
    initializeAudioContext();

    // Play DTMF tone
    playTone(digit);

    // Handle digit press
    onDigitPress(digit);
  };

  // Check if call button should be disabled
  const isCallDisabled =
    !phoneNumber ||
    isConnecting ||
    isInitializing ||
    !isConnected ||
    !hasMicrophoneAccess;

  // Get call button status text
  const getCallButtonText = () => {
    if (isInitializing) return "Initializing...";
    if (!isConnected) return "Not Connected";
    if (!hasMicrophoneAccess) return "No Microphone";
    if (!phoneNumber) return "Enter Number";
    if (isConnecting) return "Connecting...";
    return "Call";
  };

  // Get call button tooltip
  const getCallButtonTooltip = () => {
    if (isInitializing) return "Telnyx is initializing...";
    if (!isConnected)
      return "Telnyx is not connected. Please check your credentials and network connection.";
    if (!hasMicrophoneAccess)
      return "Microphone access is required. Please allow microphone permissions.";
    if (!phoneNumber) return "Please enter a phone number to call.";
    if (isConnecting) return "Call is in progress...";
    return "Click to make a call";
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Phone Number Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center">
        <div className="text-xl font-mono text-gray-800 min-h-[2rem]">
          {phoneNumber || "Enter number"}
        </div>
      </div>

      {/* Dial Pad Grid - Hidden when calling or call is active */}
      {!isConnecting && !isCallActive && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {digits.flat().map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigitClick(digit)}
              className="aspect-square bg-white border-2 border-gray-300 rounded-full hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm flex items-center justify-center"
            >
              <span className="text-xl font-semibold text-gray-800">
                {digit}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Call Control Buttons - Only show when not in active call */}
      {!isCallActive && (
        <div className="flex gap-4 justify-center">
          <button
            onClick={onCall}
            disabled={isCallDisabled}
            title={getCallButtonTooltip()}
            className={`flex-1 max-w-[120px] font-semibold py-3 px-6 rounded-full transition-colors shadow-lg flex items-center justify-center ${
              isCallDisabled
                ? "bg-gray-400 cursor-not-allowed text-gray-600"
                : "bg-green-500 hover:bg-green-600 text-white"
            }`}
          >
            {getCallButtonText()}
          </button>
          {phoneNumber && (
            <button
              onClick={onClear}
              className="flex-1 max-w-[100px] bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-full transition-colors shadow-lg"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Call Status - Only show when call is active */}
      {isCallActive && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Call Active
          </div>
        </div>
      )}
    </div>
  );
};

export default DialPad;
