import React from "react";

interface DTMFSettingsProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  enabled: boolean;
  onToggleEnabled: () => void;
  onClose: () => void;
}

const DTMFSettings: React.FC<DTMFSettingsProps> = ({
  volume,
  onVolumeChange,
  enabled,
  onToggleEnabled,
  onClose,
}) => {
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    onVolumeChange(newVolume);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">DTMF Tone Settings</h3>

        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Enable DTMF Tones
            </label>
            <button
              onClick={onToggleEnabled}
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

          {/* Volume Control */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tone Volume: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              disabled={!enabled}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Test Button */}
          <div className="text-center">
            <button
              onClick={() => {
                // Test the current volume setting
                const testTone = new (window.AudioContext ||
                  window.webkitAudioContext)();
                const oscillator = testTone.createOscillator();
                const gainNode = testTone.createGain();

                oscillator.frequency.setValueAtTime(800, testTone.currentTime);
                oscillator.type = "sine";

                gainNode.gain.setValueAtTime(0, testTone.currentTime);
                gainNode.gain.linearRampToValueAtTime(
                  volume,
                  testTone.currentTime + 0.01
                );
                gainNode.gain.linearRampToValueAtTime(
                  0,
                  testTone.currentTime + 0.2
                );

                oscillator.connect(gainNode);
                gainNode.connect(testTone.destination);

                oscillator.start(testTone.currentTime);
                oscillator.stop(testTone.currentTime + 0.2);
              }}
              disabled={!enabled}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Test Tone
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DTMFSettings;
