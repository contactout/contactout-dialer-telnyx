import React from "react";

interface ErrorPopupProps {
  error: string;
  isVisible: boolean;
  onClose: () => void;
}

const ErrorPopup: React.FC<ErrorPopupProps> = ({
  error,
  isVisible,
  onClose,
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-gray-100">
        {/* Header with Icon */}
        <div className="flex items-center justify-center pt-8 pb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-red-50 to-red-100 rounded-full flex items-center justify-center shadow-sm">
            <svg
              className="w-7 h-7 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">
          <h3 className="text-xl font-semibold text-gray-900 text-center mb-3">
            Call Failed
          </h3>
          <p className="text-gray-600 text-center text-sm leading-relaxed">
            {error}
          </p>
        </div>

        {/* Action Button */}
        <div className="px-8 pb-8">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:scale-[0.98] shadow-lg hover:shadow-xl"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPopup;
