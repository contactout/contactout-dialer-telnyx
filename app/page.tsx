"use client";

import { useState } from "react";
import DialPad from "@/components/DialPad";
import PhoneMockup from "@/components/PhoneMockup";
import LoginScreen from "@/components/LoginScreen";
import CallingScreen from "@/components/CallingScreen";
import AudioTest from "@/components/AudioTest";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showAudioTest, setShowAudioTest] = useState(false);
  const { isMobile } = useDeviceDetection();
  const { user, loading, signOut } = useAuth();

  // Telnyx configuration from environment variables
  const telnyxConfig = {
    apiKey: process.env.NEXT_PUBLIC_TELNYX_API_KEY || "",
    sipUsername: process.env.NEXT_PUBLIC_TELNYX_SIP_USERNAME || "",
    sipPassword: process.env.NEXT_PUBLIC_TELNYX_SIP_PASSWORD || "",
    phoneNumber: process.env.NEXT_PUBLIC_TELNYX_PHONE_NUMBER || "",
  };

  const {
    isConnected,
    isCallActive,
    isConnecting,
    error,
    hasMicrophoneAccess,
    makeCall,
    hangupCall,
    sendDTMF,
  } = useTelnyxWebRTC(telnyxConfig);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if user is not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  const handleDigitPress = (digit: string) => {
    if (isCallActive) {
      // Send DTMF tone during active call
      sendDTMF(digit);
    } else {
      // Add digit to phone number
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const handleCall = () => {
    if (phoneNumber) {
      makeCall(phoneNumber);
    }
  };

  const handleHangup = () => {
    hangupCall();
    setPhoneNumber("");
  };

  const handleClearNumber = () => {
    if (!isCallActive) {
      setPhoneNumber("");
    }
  };

  // Show calling screen when connecting
  if (isConnecting) {
    const callingComponent = (
      <div className="w-full">
        {/* User Info and Logout */}
        <div className="mb-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Welcome, {user.user_metadata?.full_name || user.email}
          </div>
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Sign out
          </button>
        </div>

        {/* Connection Status */}
        <div className="mb-4 text-center">
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              isConnected
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full mr-2 ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            {isConnected ? "Connected" : "Disconnected"}
          </div>

          {/* Microphone Status */}
          <div className="mt-2">
            <div
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                hasMicrophoneAccess
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full mr-2 ${
                  hasMicrophoneAccess ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              {hasMicrophoneAccess
                ? "Microphone Ready"
                : "Microphone Access Required"}
            </div>
          </div>
        </div>

        {/* Calling Screen */}
        <CallingScreen phoneNumber={phoneNumber} onHangup={handleHangup} />
      </div>
    );

    return (
      <main className="min-h-screen">
        {isMobile ? (
          <div className="p-6 flex flex-col justify-center min-h-screen bg-gray-50">
            {callingComponent}
          </div>
        ) : (
          <PhoneMockup>{callingComponent}</PhoneMockup>
        )}
      </main>
    );
  }

  const dialPadComponent = (
    <div className="w-full">
      {/* User Info and Logout */}
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Welcome, {user.user_metadata?.full_name || user.email}
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Sign out
        </button>
      </div>

      {/* Connection Status */}
      <div className="mb-4 text-center">
        <div
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
            isConnected
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          {isConnected ? "Connected" : "Disconnected"}
        </div>

        {/* Microphone Status */}
        <div className="mt-2">
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
              hasMicrophoneAccess
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full mr-2 ${
                hasMicrophoneAccess ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            {hasMicrophoneAccess
              ? "Microphone Ready"
              : "Microphone Access Required"}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      {/* Audio Test Button */}
      <div className="mb-4 text-center">
        <button
          onClick={() => setShowAudioTest(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
              clipRule="evenodd"
            />
          </svg>
          Test Microphone
        </button>
      </div>

      {/* Dial Pad */}
      <DialPad
        phoneNumber={phoneNumber}
        onDigitPress={handleDigitPress}
        onCall={handleCall}
        onHangup={handleHangup}
        onClear={handleClearNumber}
        isCallActive={isCallActive}
        isConnecting={isConnecting}
      />

      {/* Instructions */}
      <div className="mt-8 text-center text-sm text-gray-500">
        {!isConnected && (
          <p>Configure your Telnyx credentials in .env.local to get started</p>
        )}
        {isConnected && !isCallActive && (
          <p>Enter a phone number and press Call</p>
        )}
        {isCallActive && <p>Use the dial pad to send DTMF tones</p>}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen">
      {isMobile ? (
        <div className="p-6 flex flex-col justify-center min-h-screen bg-gray-50">
          {dialPadComponent}
        </div>
      ) : (
        <PhoneMockup>{dialPadComponent}</PhoneMockup>
      )}
      {/* Audio Test Modal */}
      {showAudioTest && <AudioTest onClose={() => setShowAudioTest(false)} />}
    </main>
  );
}
