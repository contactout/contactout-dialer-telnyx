import React, { useState } from "react";
import { useCallAudio } from "@/hooks/useCallAudio";

interface AudioSettingsProps {
  isVisible: boolean;
  onClose: () => void;
}

const AudioSettings: React.FC<AudioSettingsProps> = ({
  isVisible,
  onClose,
}) => {
  const [volume, setVolume] = useState(0.4);
  const [ringtoneVolume, setRingtoneVolume] = useState(0.3);
  const [statusVolume, setStatusVolume] = useState(0.25);
  const [enabled, setEnabled] = useState(true);

  // Create audio hook instance for testing
  const {
    playCallAudio,
    stopAllAudio,
    initializeAudioContext,
    playClassicRingtone,
    playBusyTone,
    playErrorTone,
    playCallConnectedSound,
    playCallEndedSound,
    playConnectingSound,
  } = useCallAudio({
    volume,
    enabled,
    ringtoneVolume,
    statusVolume,
  });

  // Initialize audio context when component mounts
  React.useEffect(() => {
    if (isVisible) {
      initializeAudioContext();
    }
  }, [isVisible, initializeAudioContext]);

  // Test different audio types
  const testAudio = (audioType: string) => {
    stopAllAudio(); // Stop any ongoing audio first

    switch (audioType) {
      case "ringtone":
        playCallAudio("ringing");
        break;
      case "connecting":
        playCallAudio("connecting");
        break;
      case "connected":
        playCallAudio("connected");
        break;
      case "ended":
        playCallAudio("ended");
        break;
      case "busy":
        playCallAudio("busy");
        break;
      case "error":
        playCallAudio("error");
        break;
      default:
        break;
    }
  };

  // Stop all test audio
  const stopTestAudio = () => {
    stopAllAudio();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Audio Settings
            </h3>
            <p className="text-sm text-gray-600">
              Configure call audio feedback
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700">
                Enable Audio Feedback
              </label>
              <p className="text-xs text-gray-500">
                Master switch for all call audio
              </p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Ringtone Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Ringtone Volume
              </label>
              <span className="text-xs text-gray-500">
                {Math.round(ringtoneVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={ringtoneVolume}
              onChange={(e) => setRingtoneVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Volume for incoming call ringtone
            </p>
          </div>

          {/* Status Sounds Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Status Sounds Volume
              </label>
              <span className="text-xs text-gray-500">
                {Math.round(statusVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={statusVolume}
              onChange={(e) => setStatusVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Volume for call status sounds
            </p>
          </div>

          {/* Master Volume */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Master Volume
              </label>
              <span className="text-xs text-gray-500">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Overall audio volume control
            </p>
          </div>

          {/* Audio Test Section */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Test Audio
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => testAudio("ringtone")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Ringtone
              </button>
              <button
                onClick={() => testAudio("connecting")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Connecting
              </button>
              <button
                onClick={() => testAudio("connected")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Connected
              </button>
              <button
                onClick={() => testAudio("ended")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Ended
              </button>
              <button
                onClick={() => testAudio("busy")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Busy
              </button>
              <button
                onClick={() => testAudio("error")}
                disabled={!enabled}
                className="px-3 py-2 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Test Error
              </button>
            </div>

            {/* Stop Audio Button */}
            <button
              onClick={stopTestAudio}
              className="w-full mt-3 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm"
            >
              Stop All Audio
            </button>
          </div>

          {/* Audio Information */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Audio Information
            </h4>
            <div className="text-xs text-gray-600 space-y-1">
              <p>
                • <strong>Ringtone:</strong> Classic 2-tone alternating pattern
                (2s on, 4s off)
              </p>
              <p>
                • <strong>Connecting:</strong> Soft single tone during call
                setup
              </p>
              <p>
                • <strong>Connected:</strong> Two ascending tones when call is
                answered
              </p>
              <p>
                • <strong>Ended:</strong> Two descending tones when call ends
              </p>
              <p>
                • <strong>Busy:</strong> Alternating tones for
                failed/unreachable calls
              </p>
              <p>
                • <strong>Error:</strong> Three descending beeps for connection
                failures
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioSettings;
