"use client";

import { useState } from "react";
import DialPad from "@/components/DialPad";
import PhoneMockup from "@/components/PhoneMockup";
import LoginScreen from "@/components/LoginScreen";
import CallingScreen from "@/components/CallingScreen";
import AudioTest from "@/components/AudioTest";
import SettingsDropdown from "@/components/SettingsDropdown";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { useAuth } from "@/contexts/AuthContext";
import DTMFSettings from "@/components/DTMFSettings";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showAudioTest, setShowAudioTest] = useState(false);
  const [showDTMFSettings, setShowDTMFSettings] = useState(false);
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
    callControlId,
    makeCall,
    hangupCall,
    sendDTMF,
    debugAudioSetup,
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
          <SettingsDropdown
            onTestMicrophone={() => setShowAudioTest(true)}
            onDebugAudio={debugAudioSetup}
            onDTMFSettings={() => setShowDTMFSettings(true)}
            onSignOut={signOut}
          />
        </div>

        {/* Connection Status and Controls - All on one line */}
        <div className="mb-4 flex items-center justify-center gap-3 flex-wrap">
          {/* Connection Status */}
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
            {hasMicrophoneAccess ? "Microphone Ready" : "Microphone Required"}
          </div>

          {/* Call Control Status */}
          {callControlId && (
            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
              Call Streaming Active
            </div>
          )}
        </div>

        {/* Calling Screen */}
        <CallingScreen phoneNumber={phoneNumber} onHangup={handleHangup} />

        {/* Debug Audio Button */}
        <div className="mt-4 text-center">
          <button
            onClick={debugAudioSetup}
            className="inline-flex items-center px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-colors"
            title="Debug Audio Setup"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            Debug Audio
          </button>
        </div>
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
        <SettingsDropdown
          onTestMicrophone={() => setShowAudioTest(true)}
          onDebugAudio={debugAudioSetup}
          onDTMFSettings={() => setShowDTMFSettings(true)}
          onSignOut={signOut}
        />
      </div>

      {/* Connection Status and Controls - All on one line */}
      <div className="mb-4 flex items-center justify-center gap-3 flex-wrap">
        {/* Connection Status */}
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
          {hasMicrophoneAccess ? "Microphone Ready" : "Microphone Required"}
        </div>

        {/* Call Control Status */}
        {callControlId && (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
            Call Streaming Active
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm text-center">
          {error}
        </div>
      )}

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

      {/* DTMF Settings Modal */}
      {showDTMFSettings && (
        <DTMFSettings
          volume={0.3}
          onVolumeChange={(volume) => console.log("Volume changed:", volume)}
          enabled={true}
          onToggleEnabled={() => console.log("Enabled toggled")}
          onClose={() => setShowDTMFSettings(false)}
        />
      )}
    </main>
  );
}
