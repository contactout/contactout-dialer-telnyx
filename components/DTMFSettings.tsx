import React, { useState } from "react";

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
  const [localVolume, setLocalVolume] = useState(volume);
  const [localEnabled, setLocalEnabled] = useState(enabled);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setLocalVolume(newVolume);
    onVolumeChange(newVolume);
  };

  const handleToggleEnabled = () => {
    const newEnabled = !localEnabled;
    setLocalEnabled(newEnabled);
    onToggleEnabled();
  };

  const handleSave = () => {
    onVolumeChange(localVolume);
    onToggleEnabled();
    onClose();
  };

  const handleCancel = () => {
    setLocalVolume(volume);
    setLocalEnabled(enabled);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            DTMF Tone Settings
          </h2>
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

        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Enable DTMF Tones
            </label>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localEnabled ? "bg-blue-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Volume Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tone Volume: {Math.round(localVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={localVolume}
              onChange={handleVolumeChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              disabled={!localEnabled}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Test Tone Button */}
          <div className="text-center">
            <button
              onClick={() => {
                // This would test the current volume settings
              }}
              className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!localEnabled}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.5 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.5l3.883-3.793a1 1 0 011.617.793zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Test Tone
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default DTMFSettings;
