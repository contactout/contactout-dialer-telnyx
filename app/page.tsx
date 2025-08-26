"use client";

import { useState, useEffect } from "react";
import DialPad from "@/components/DialPad";
import PhoneMockup from "@/components/PhoneMockup";
import LoginScreen from "@/components/LoginScreen";
import CallingScreen from "@/components/CallingScreen";
import AudioTest from "@/components/AudioTest";
import SettingsDropdown from "@/components/SettingsDropdown";
import CallHistory from "@/components/CallHistory";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { useCallHistory } from "@/hooks/useCallHistory";
import { useAuth } from "@/contexts/AuthContext";
import DTMFSettings from "@/components/DTMFSettings";
import { DatabaseService } from "@/lib/database";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showAudioTest, setShowAudioTest] = useState(false);
  const [showDTMFSettings, setShowDTMFSettings] = useState(false);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { isMobile } = useDeviceDetection();
  const { user, loading, signOut } = useAuth();

  // Call history hook
  const {
    callHistory,
    addCall,
    getLastDialed,
    clearHistory,
    removeCall,
    formatTimestamp,
  } = useCallHistory();

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
  } = useTelnyxWebRTC(
    telnyxConfig,
    user?.id,
    (status, phoneNumber, duration) => {
      // Update call history with the correct status and duration
      if (phoneNumber) {
        addCall(phoneNumber, status, duration);
      }
    }
  );

  // Check admin status when user changes
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (user) {
        console.log("Checking admin status for user:", user.email);
        try {
          const adminStatus = await DatabaseService.isUserAdmin(user.id);
          console.log("Database admin check result:", adminStatus);
          setIsAdmin(adminStatus);
        } catch (error) {
          console.error("Error checking admin status:", error);
          // Fallback to email-based admin check
          const fallbackAdmin = user.email?.includes("admin") || false;
          console.log("Fallback admin check result:", fallbackAdmin);
          setIsAdmin(fallbackAdmin);
        }
      } else {
        setIsAdmin(false);
      }
    };

    checkAdminStatus();
  }, [user]);

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

  // Call history functions
  const handleRedial = (phoneNumber: string) => {
    setPhoneNumber(phoneNumber);
    setShowCallHistory(false);
  };

  const handleRemoveCall = (timestamp: number) => {
    removeCall(timestamp);
  };

  const handleClearHistory = () => {
    clearHistory();
  };

  // Show calling screen when connecting OR when call is active
  if (isConnecting || isCallActive) {
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
            onCallHistory={() => setShowCallHistory(true)}
            onSignOut={signOut}
            isAdmin={user?.email?.includes("admin") || isAdmin || false}
          />
        </div>

        {/* Session Status Indicator */}
        <div className="mb-4 flex justify-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
            <svg
              className="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            Session Active - Auto-logout after 4 hours of inactivity
          </div>
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
      {/* User Info, Status Indicators, and Settings Row */}
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Welcome, {user.user_metadata?.full_name || user.email}
        </div>

        <div className="flex items-center space-x-3">
          {/* Connection Status Icon */}
          <div
            className="flex items-center space-x-1"
            title={isConnected ? "Connected" : "Disconnected"}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <svg
              className="w-4 h-4 text-gray-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Microphone Status Icon */}
          <div
            className="flex items-center space-x-1"
            title={
              hasMicrophoneAccess ? "Microphone Ready" : "Microphone Required"
            }
          >
            <div
              className={`w-2 h-2 rounded-full ${
                hasMicrophoneAccess ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <svg
              className="w-4 h-4 text-gray-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          <SettingsDropdown
            onTestMicrophone={() => setShowAudioTest(true)}
            onDebugAudio={debugAudioSetup}
            onDTMFSettings={() => setShowDTMFSettings(true)}
            onCallHistory={() => setShowCallHistory(true)}
            onSignOut={signOut}
            isAdmin={user?.email?.includes("admin") || isAdmin || false}
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm text-center">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setShowCallHistory(false)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            !showCallHistory
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <span>Dial Pad</span>
          </div>
        </button>
        <button
          onClick={() => setShowCallHistory(true)}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            showCallHistory
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span>History</span>
          </div>
        </button>
      </div>

      {/* Tab Content */}
      {showCallHistory ? (
        <CallHistory
          callHistory={callHistory}
          onRedial={handleRedial}
          onRemoveCall={handleRemoveCall}
          onClearHistory={handleClearHistory}
          formatTimestamp={formatTimestamp}
        />
      ) : (
        <>
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
              <p>
                Configure your Telnyx credentials in .env.local to get started
              </p>
            )}
            {isConnected && !isCallActive && (
              <p>Enter a phone number and press Call</p>
            )}
            {isCallActive && <p>Use the dial pad to send DTMF tones</p>}
          </div>
        </>
      )}
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
