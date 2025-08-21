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
}

const DialPad: React.FC<DialPadProps> = ({
  phoneNumber,
  onDigitPress,
  onCall,
  onHangup,
  isCallActive,
  isConnecting,
}) => {
  const { playTone } = useDTMFTones();

  const handleDigitClick = (digit: string) => {
    playTone(digit); // Play DTMF tone
    onDigitPress(digit);
  };

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  return (
    <div className="text-center">
      {/* Phone Number Display */}
      <div className="mb-6">
        <div className="text-2xl font-mono text-gray-800 mb-2">
          {phoneNumber || "Enter phone number"}
        </div>
        <div className="text-sm text-gray-500">
          {phoneNumber ? `${phoneNumber.length} digits` : "No number entered"}
        </div>
      </div>

      {/* Dial Pad Grid */}
      {!isConnecting && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {digits.flat().map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigitClick(digit)}
              className="w-16 h-16 bg-gray-100 hover:bg-gray-200 text-gray-800 text-2xl font-semibold rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isConnecting}
            >
              {digit}
            </button>
          ))}
        </div>
      )}

      {/* Call/Hangup Button */}
      <div className="mb-6">
        {isCallActive ? (
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
        ) : (
          <button
            onClick={onCall}
            disabled={!phoneNumber || isConnecting}
            className="w-20 h-20 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-full transition-colors shadow-lg flex items-center justify-center mx-auto disabled:cursor-not-allowed"
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default DialPad;
