import React from 'react';

interface PhoneMockupProps {
  children: React.ReactNode;
}

const PhoneMockup: React.FC<PhoneMockupProps> = ({ children }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 p-8">
      <div className="w-full max-w-md">
        {/* Simple Container */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default PhoneMockup;
