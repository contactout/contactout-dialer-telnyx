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
  onClear,
  isCallActive,
  isConnecting,
}) => {
  const { playTone, volume, enabled } = useDTMFTones();

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
    <div className="w-full max-w-sm mx-auto">
      {/* Phone Number Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center">
        <div className="text-2xl font-mono text-gray-800 min-h-[2rem]">
          {phoneNumber || "Enter number"}
        </div>
      </div>

      {/* Dial Pad Grid - Hidden when calling */}
      {!isConnecting && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {digits.flat().map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigitClick(digit)}
              className="aspect-square bg-white border-2 border-gray-300 rounded-full text-2xl font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
              disabled={isConnecting}
            >
              {digit}
            </button>
          ))}
        </div>
      )}

      {/* Call Control Buttons */}
      <div className="flex gap-4 justify-center">
        {!isCallActive ? (
          <>
            <button
              onClick={onCall}
              disabled={!phoneNumber || isConnecting}
              className="flex-1 max-w-[120px] bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-full transition-colors shadow-lg flex items-center justify-center"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </button>
            {phoneNumber && (
              <button
                onClick={onClear}
                className="flex-1 max-w-[100px] bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-full transition-colors shadow-lg"
              >
                Clear
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onHangup}
            className="flex-1 max-w-[120px] bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-full transition-colors shadow-lg"
          >
            Hang Up
          </button>
        )}
      </div>

      {/* Call Status */}
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
