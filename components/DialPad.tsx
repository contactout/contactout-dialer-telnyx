import React, { useEffect, useCallback, useState } from "react";
import { Phone } from "lucide-react";
import { validatePhoneNumber, getCountryFlag } from "@/lib/phoneNumberUtils";
import { logError } from "@/lib/errorHandler";
import { useDTMFTones } from "@/hooks/useDTMFTones";

interface DialPadProps {
  phoneNumber: string;
  onDigitPress: (digit: string) => void;
  onCall: () => void;
  onClear: () => void;
  onBackspace?: () => void;
  isConnecting: boolean;
  isCallActive: boolean;
  isInitializing: boolean;
  isConnected: boolean;
  hasMicrophoneAccess: boolean;
}

const DialPad: React.FC<DialPadProps> = ({
  phoneNumber,
  onDigitPress,
  onCall,
  onClear,
  onBackspace,
  isConnecting,
  isCallActive,
  isInitializing,
  isConnected,
  hasMicrophoneAccess,
}) => {
  const [formattedNumber, setFormattedNumber] = React.useState("");
  const [countryInfo, setCountryInfo] = React.useState<any>(null);
  const [validationError, setValidationError] = React.useState("");
  const [isValidNumber, setIsValidNumber] = React.useState(false);

  // Use the proper DTMF tones hook
  const { playTone, initializeAudioContext } = useDTMFTones();

  // Validate and format phone number
  useEffect(() => {
    if (phoneNumber) {
      try {
        const validation = validatePhoneNumber(phoneNumber);
        if (validation.isValid) {
          setIsValidNumber(true);
          setValidationError("");
          setFormattedNumber(validation.formattedNumber);
          setCountryInfo({
            code: validation.countryCode,
            name: validation.countryName,
          });
        } else {
          setValidationError("Invalid phone number format");
          setFormattedNumber(phoneNumber);
          setCountryInfo(null);
        }
      } catch (error) {
        setValidationError("Error validating phone number");
        setIsValidNumber(false);
        logError("Phone number validation error", {
          level: "error",
          category: "validation",
          details: { input: phoneNumber, error },
        });
      }
    } else {
      setValidationError("");
      setIsValidNumber(false);
      setFormattedNumber("");
      setCountryInfo(null);
    }
  }, [phoneNumber]);

  const handleDigitClick = useCallback(
    (digit: string) => {
      console.log("🔢 Digit clicked:", digit);

      // Initialize audio context on first user interaction
      console.log("🎵 Initializing audio context...");
      initializeAudioContext();

      // Play DTMF tone
      console.log("🔊 Playing DTMF tone for digit:", digit);
      playTone(digit);

      // Handle digit press
      onDigitPress(digit);
    },
    [initializeAudioContext, playTone, onDigitPress]
  );

  // Check if call button should be disabled
  const isCallDisabled =
    !phoneNumber ||
    !isValidNumber ||
    isConnecting ||
    isInitializing ||
    !isConnected ||
    !hasMicrophoneAccess ||
    !!validationError;

  // Debug logging for call button state
  useEffect(() => {
    console.log("🔍 Call button state check:", {
      phoneNumber,
      isValidNumber,
      isConnecting,
      isInitializing,
      isConnected,
      hasMicrophoneAccess,
      validationError,
      isCallDisabled,
    });
  }, [
    phoneNumber,
    isValidNumber,
    isConnecting,
    isInitializing,
    isConnected,
    hasMicrophoneAccess,
    validationError,
    isCallDisabled,
  ]);

  // Get call button tooltip
  const getCallButtonTooltip = () => {
    if (isInitializing) return "Telnyx is initializing...";
    if (!isConnected)
      return "Telnyx is not connected. Please check your credentials and network connection.";
    if (!hasMicrophoneAccess)
      return "Microphone access is required. Please allow microphone permissions.";
    if (!phoneNumber) return "Please enter a phone number to call.";
    if (!isValidNumber) return "Please enter a valid phone number.";
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
    <div className="w-full max-w-sm mx-auto flex flex-col justify-start py-4">
      {/* Phone Number Display */}
      <div className="mb-6 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl text-center border border-gray-200 shadow-sm">
        <div className="text-xl font-mono text-gray-800 min-h-[2rem] flex items-center justify-center">
          {countryInfo && (
            <span className="mr-2 text-2xl">
              {getCountryFlag(countryInfo.code)}
            </span>
          )}
          {formattedNumber || (
            <span className="text-gray-400 font-normal">Enter number</span>
          )}
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="mt-2 text-sm text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg border border-red-200">
            {validationError}
          </div>
        )}
      </div>

      {/* Dial Pad Grid - Hidden when calling or call is active */}
      {!isConnecting && !isCallActive && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-3">
            {digits.flat().map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigitClick(digit)}
                className="aspect-square border-2 rounded-full transition-all duration-150 shadow-md flex items-center justify-center transform active:scale-95 hover:shadow-lg bg-white border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-800 hover:border-gray-400"
                title={`Press ${digit}`}
              >
                <span className="font-bold text-xl">{digit}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Call Control Buttons - Only show when not in active call */}
      {!isCallActive && (
        <div className="relative w-full flex justify-center items-center">
          {/* Call Button - Always perfectly centered */}
          <button
            onClick={() => {
              console.log("📞 Call button clicked!");
              console.log("📊 Call button state:", {
                phoneNumber,
                isValidNumber,
                isConnecting,
                isInitializing,
                isConnected,
                hasMicrophoneAccess,
                validationError,
              });
              onCall();
            }}
            disabled={isCallDisabled}
            title={getCallButtonTooltip()}
            className={`w-20 h-20 font-semibold rounded-full transition-all duration-200 shadow-lg flex items-center justify-center transform active:scale-95 hover:shadow-xl z-10 ${
              isCallDisabled
                ? "bg-gray-400 cursor-not-allowed text-gray-600 shadow-md"
                : "bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl"
            }`}
          >
            <Phone className="w-8 h-8" />
          </button>

          {/* Backspace Button - Only show when there's a number, positioned to the right */}
          {phoneNumber && (
            <button
              onClick={() => onBackspace && onBackspace()}
              className="absolute left-1/2 w-16 h-16 bg-red-50 hover:bg-red-100 border-2 border-red-300 text-red-700 rounded-full transition-all duration-200 shadow-md flex items-center justify-center transform active:scale-95 hover:shadow-lg translate-x-16"
              title="Delete last digit"
            >
              <span className="text-xl font-bold">⌫</span>
            </button>
          )}
        </div>
      )}

      {/* Call Status - Only show when call is active */}
      {isCallActive && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full text-sm bg-green-100 text-green-800 border border-green-200 shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Call Active
          </div>
        </div>
      )}
    </div>
  );
};

export default DialPad;
