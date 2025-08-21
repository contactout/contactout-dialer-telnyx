import React, { useState } from "react";
import { useDTMFTones } from "@/hooks/useDTMFTones";
import DTMFSettings from "./DTMFSettings";

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
  const { playTone, volume, updateVolume, enabled, toggleEnabled } =
    useDTMFTones();
  const [showSettings, setShowSettings] = useState(false);

  const digits = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["*", "0", "#"],
  ];

  const handleDigitClick = (digit: string) => {
    // Play DTMF tone for audio feedback
    playTone(digit);

    // Add digit to phone number
    onDigitPress(digit);
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Phone Number Display */}
      <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center">
        <div className="text-2xl font-mono text-gray-800 min-h-[2rem]">
          {phoneNumber || "Enter number"}
        </div>
      </div>

      {/* DTMF Settings Button */}
      <div className="mb-4 text-center">
        <button
          onClick={() => setShowSettings(true)}
          className="inline-flex items-center px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          title="DTMF Tone Settings"
        >
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
          DTMF Settings
        </button>

        {/* Quick Status Indicator */}
        <div className="mt-2 text-xs text-gray-500">
          {enabled ? `Tones: ${Math.round(volume * 100)}%` : "Tones: Disabled"}
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
              className="flex-1 max-w-[120px] bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-full transition-colors shadow-lg"
            >
              Call
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

      {/* DTMF Settings Modal */}
      {showSettings && (
        <DTMFSettings
          volume={volume}
          onVolumeChange={updateVolume}
          enabled={enabled}
          onToggleEnabled={toggleEnabled}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default DialPad;
