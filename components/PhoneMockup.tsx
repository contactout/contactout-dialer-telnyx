import React from 'react';

interface PhoneMockupProps {
  children: React.ReactNode;
}

const PhoneMockup: React.FC<PhoneMockupProps> = ({ children }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-8">
      <div className="relative">
        {/* Phone Frame */}
        <div className="w-80 h-[640px] bg-black rounded-[3rem] p-2 shadow-2xl">
          {/* Screen */}
          <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
            {/* Notch */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10"></div>
            
            {/* Content Area */}
            <div className="pt-8 px-6 pb-6 h-full flex flex-col">
              {/* Status Bar */}
              <div className="flex justify-between items-center mb-4 text-sm text-gray-600">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-2 border border-gray-400 rounded-sm">
                    <div className="w-3 h-1 bg-green-500 rounded-sm"></div>
                  </div>
                </div>
              </div>

              {/* App Content */}
              <div className="flex-1 flex flex-col justify-center">
                {children}
              </div>
            </div>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-800 rounded-full"></div>
      </div>
    </div>
  );
};

export default PhoneMockup;
