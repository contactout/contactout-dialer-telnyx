import React, { useState, useEffect } from "react";
import { useDTMFTones } from "@/hooks/useDTMFTones";
import {
  validatePhoneNumberWithErrors,
  toE164,
  getCountryFlag,
} from "@/lib/phoneNumberUtils";
import { securityManager } from "@/lib/security";
import { logError } from "@/lib/errorHandler";

interface DialPadProps {
  phoneNumber: string;
  onDigitPress: (digit: string) => void;
  onBackspace?: () => void;
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
  onBackspace,
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
  const [validationError, setValidationError] = useState<string>("");
  const [isValidNumber, setIsValidNumber] = useState(false);
  const [countryInfo, setCountryInfo] = useState<any>(null);
  const [formattedNumber, setFormattedNumber] = useState("");

  // Validate phone number when it changes
  useEffect(() => {
    if (phoneNumber) {
      try {
        // Security validation first
        const securityValidation =
          securityManager.validatePhoneNumber(phoneNumber);

        if (securityValidation.riskLevel === "high") {
          setValidationError("Invalid phone number format detected");
          setIsValidNumber(false);
          logError("High risk phone number input detected", {
            level: "warning",
            category: "security",
            details: {
              input: phoneNumber,
              riskLevel: securityValidation.riskLevel,
            },
          });
          return;
        }

        // Phone number format validation
        const validation = validatePhoneNumberWithErrors(phoneNumber);
        setIsValidNumber(validation.isValid);

        if (validation.isValid) {
          setValidationError("");
          setFormattedNumber(validation.info.formattedNumber);
          setCountryInfo(
            validation.info.countryCode
              ? {
                  code: validation.info.countryCode,
                  name: validation.info.countryName,
                }
              : null
          );
        } else {
          setValidationError(
            validation.errors[0] || "Invalid phone number format"
          );
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

  const handleDigitClick = (digit: string) => {
    // Handle backspace specially
    if (digit === "⌫") {
      if (onBackspace) {
        onBackspace();
      }
      return;
    }

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
    !isValidNumber ||
    isConnecting ||
    isInitializing ||
    !isConnected ||
    !hasMicrophoneAccess ||
    !!validationError;

  // Get call button status text
  const getCallButtonText = () => {
    if (isInitializing) return "Initializing...";
    if (!isConnected) return "Not Connected";
    if (!hasMicrophoneAccess) return "No Microphone";
    if (!phoneNumber) return "Enter Number";
    if (!isValidNumber) return "Invalid Number";
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
    if (!isValidNumber) return "Please enter a valid phone number.";
    if (isConnecting) return "Call is in progress...";
    return "Click to make a call";
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["#", "0", "⌫"],
  ];

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col justify-center min-h-[600px]">
      {/* Phone Number Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center">
        <div className="text-xl font-mono text-gray-800 min-h-[2rem]">
          {formattedNumber || "Enter number"}
        </div>

        {/* Country Flag and Info */}
        {countryInfo && (
          <div className="mt-2 flex items-center justify-center space-x-2 text-sm text-gray-600">
            <span>{getCountryFlag(countryInfo.code)}</span>
            <span>{countryInfo.name}</span>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="mt-2 text-sm text-red-600 font-medium">
            {validationError}
          </div>
        )}

        {/* E.164 Format Display */}
        {isValidNumber && phoneNumber && (
          <div className="mt-2 text-xs text-gray-500 font-mono">
            E.164: {toE164(phoneNumber)}
          </div>
        )}
      </div>

      {/* Dial Pad Grid - Hidden when calling or call is active */}
      {!isConnecting && !isCallActive && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {digits.flat().map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigitClick(digit)}
              className={`aspect-square border-2 rounded-full transition-colors shadow-sm flex items-center justify-center ${
                digit === "⌫"
                  ? "bg-red-50 border-red-300 hover:bg-red-100 active:bg-red-200 text-red-700"
                  : "bg-white border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-800"
              }`}
              disabled={digit === "⌫" && !phoneNumber}
              title={digit === "⌫" ? "Delete last digit" : `Press ${digit}`}
            >
              <span
                className={`font-semibold ${
                  digit === "⌫" ? "text-lg" : "text-xl"
                }`}
              >
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

      {/* Validation Status */}
      {phoneNumber && !isCallActive && (
        <div className="mt-4 text-center">
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              isValidNumber
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full mr-2 ${
                isValidNumber ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            {isValidNumber ? "Valid Number" : "Invalid Number"}
          </div>
        </div>
      )}
    </div>
  );
};

export default DialPad;
