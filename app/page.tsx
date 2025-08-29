"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { useCallHistory } from "@/hooks/useCallHistory";
import { useTelnyxWebRTC } from "@/hooks/useTelnyxWebRTC";
import { Phone, History } from "lucide-react";
import {
  useDialerState,
  DialerState,
  DialerActions,
} from "@/hooks/useDialerState";
import { useDialerLogic, DialerLogic } from "@/hooks/useDialerLogic";
import { useDialerEffects, DialerEffects } from "@/hooks/useDialerEffects";
import { useDialerConfig, DialerConfig } from "@/hooks/useDialerConfig";

// Components
import PhoneMockup from "@/components/PhoneMockup";
import DialPad from "@/components/DialPad";
import CallingScreen from "@/components/CallingScreen";
import CallHistory from "@/components/CallHistory";
import AudioTest from "@/components/AudioTest";
import AudioSettings from "@/components/AudioSettings";
import DTMFSettings from "@/components/DTMFSettings";
import ErrorPopup from "@/components/ErrorPopup";
import SettingsDropdown from "@/components/SettingsDropdown";
import CallAnalyticsDashboard from "@/components/CallAnalyticsDashboard";
import LoginScreen from "@/components/LoginScreen";

export default function Home() {
  // Core hooks
  const { user, loading, signOut, session, isAdmin } = useAuth();
  const { isMobile } = useDeviceDetection();

  // State management
  const [state, actions] = useDialerState();

  // Configuration
  const config = useDialerConfig();

  // Call history hook
  const {
    callHistory,
    formatTimestamp,
    loading: callHistoryLoading,
    error: callHistoryError,
    refreshHistory,
  } = useCallHistory();

  // Telnyx WebRTC hook
  const telnyxActions = useTelnyxWebRTC(
    config.telnyxConfig,
    user?.id,
    (status, phoneNumber, duration) => {
      // Call history is now automatically tracked in the database
      // Refresh the call history to show the new call
      console.log("Call completed:", { status, phoneNumber, duration });
      // Refresh call history after a short delay to ensure database update
      setTimeout(() => {
        refreshHistory();
      }, 1000);
    }
  );

  // Business logic
  const logic = useDialerLogic(state, actions, telnyxActions);

  // Side effects
  const effects = useDialerEffects(state, actions, telnyxActions);

  // Debug logging for admin status
  useEffect(() => {
    console.log("Main page - Admin status changed:", {
      isAdmin,
      userEmail: user?.email,
      userId: user?.id,
    });
  }, [isAdmin, user]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing application...</p>
          <p className="mt-2 text-sm text-gray-500">
            This should only take a few seconds
          </p>

          {/* Loading timeout warning */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">
              If this takes longer than 5 seconds, please refresh the page
            </p>
          </div>

          {/* Environment variable check */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              Make sure you have configured your environment variables in
              .env.local
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show login screen if user is not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  // Show calling screen when connecting OR when call is active
  if (telnyxActions.isConnecting || telnyxActions.isCallActive) {
    const callingComponent = (
      <div className="w-full min-h-[600px] flex flex-col">
        {/* User Info, Status Indicators, and Settings Row */}
        <div className="mb-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Welcome, {user.user_metadata?.full_name || user.email}
          </div>

          <div className="flex items-center space-x-3">
            {/* Connection Status Icon */}
            <div
              className="flex items-center space-x-1"
              title={
                telnyxActions.isInitializing
                  ? "Initializing..."
                  : telnyxActions.isConnected
                  ? "Connected"
                  : "Disconnected"
              }
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  telnyxActions.isInitializing
                    ? "bg-yellow-500"
                    : telnyxActions.isConnected
                    ? "bg-green-500"
                    : "bg-red-500"
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
                telnyxActions.hasMicrophoneAccess
                  ? "Microphone Ready"
                  : "Microphone Required"
              }
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  telnyxActions.hasMicrophoneAccess
                    ? "bg-green-500"
                    : "bg-red-500"
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
              onTestMicrophone={() => actions.setShowAudioTest(true)}
              onAudioSettings={() => actions.setShowAudioSettings(true)}
              onDebugAudio={telnyxActions.debugAudioSetup}
              onDTMFSettings={() => actions.setShowDTMFSettings(true)}
              onSignOut={signOut}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* Calling Screen */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <CallingScreen
            phoneNumber={state.phoneNumber}
            onHangup={logic.handleHangup}
            error={telnyxActions.error}
            onReturnToDialPad={() => {
              // Only return to dialpad if there's no call failure error
              if (
                !telnyxActions.error ||
                (!telnyxActions.error.includes("failed") &&
                  !telnyxActions.error.includes("invalid"))
              ) {
                telnyxActions.forceResetCallState();
                actions.setPhoneNumber("");
                actions.setAutoRedirectCountdown(null);
                telnyxActions.clearError();
              }
              // If there's a call failure error, let the error popup handle the navigation
            }}
            onRetry={() => {
              // Retry the call with error recovery
              if (state.phoneNumber) {
                telnyxActions.retryCall(state.phoneNumber, 3);
              }
            }}
            isConnecting={telnyxActions.isConnecting}
            isCallActive={telnyxActions.isCallActive}
            callState={telnyxActions.callState || ""}
            callDuration={state.callDuration}
            autoRedirectCountdown={state.autoRedirectCountdown}
          />
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
    <div className="w-full min-h-[600px] flex flex-col">
      {/* User Info, Status Indicators, and Settings Row */}
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Welcome, {user.user_metadata?.full_name || user.email}
        </div>

        <div className="flex items-center space-x-3">
          {/* Connection Status Icon */}
          <div
            className="flex items-center space-x-1"
            title={
              telnyxActions.isInitializing
                ? "Initializing..."
                : telnyxActions.isConnected
                ? "Connected"
                : "Disconnected"
            }
          >
            <div
              className={`w-2 h-2 rounded-full ${
                telnyxActions.isInitializing
                  ? "bg-yellow-500"
                  : telnyxActions.isConnected
                  ? "bg-green-500"
                  : "bg-red-500"
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
              telnyxActions.hasMicrophoneAccess
                ? "Microphone Ready"
                : "Microphone Required"
            }
          >
            <div
              className={`w-2 h-2 rounded-full ${
                telnyxActions.hasMicrophoneAccess
                  ? "bg-green-500"
                  : "bg-red-500"
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
            onTestMicrophone={() => actions.setShowAudioTest(true)}
            onAudioSettings={() => actions.setShowAudioSettings(true)}
            onDebugAudio={telnyxActions.debugAudioSetup}
            onDTMFSettings={() => actions.setShowDTMFSettings(true)}
            onSignOut={signOut}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      {/* Tab Navigation - Better Design */}
      <div className="mb-6">
        <div className="bg-gray-100 rounded-lg p-1">
          <div className="flex space-x-1">
            <button
              onClick={() => actions.setShowCallHistory(false)}
              className={`flex-1 py-3 px-4 rounded-md font-medium text-sm transition-all duration-200 ${
                !state.showCallHistory
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <Phone className="w-4 h-4 inline mr-2" />
              Dial Pad
            </button>
            <button
              onClick={() => actions.setShowCallHistory(true)}
              className={`flex-1 py-3 px-4 rounded-md font-medium text-sm transition-all duration-200 ${
                state.showCallHistory
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <History className="w-4 h-4 inline mr-2" />
              Call History
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center">
        {state.showCallHistory ? (
          <CallHistory
            callHistory={callHistory}
            onRedial={logic.handleRedial}
            formatTimestamp={formatTimestamp}
            loading={callHistoryLoading}
            error={callHistoryError}
          />
        ) : (
          <DialPad
            phoneNumber={state.phoneNumber}
            onDigitPress={logic.handleDigitPress}
            onBackspace={logic.handleBackspace}
            onCall={logic.handleCall}
            onHangup={logic.handleHangup}
            onClear={logic.handleClearNumber}
            isCallActive={telnyxActions.isCallActive}
            isConnecting={telnyxActions.isConnecting}
            isInitializing={telnyxActions.isInitializing}
            isConnected={telnyxActions.isConnected}
            hasMicrophoneAccess={telnyxActions.hasMicrophoneAccess}
          />
        )}
      </div>

      {/* Configuration Status */}
      {!config.hasAllCredentials && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-2">Configuration Issues Detected:</p>
            <ul className="list-disc list-inside space-y-1">
              {config.configurationIssues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              Please check your environment variables in .env.local
            </p>
          </div>
        </div>
      )}

      {/* Connection Status */}
      {!telnyxActions.isInitializing && !telnyxActions.isConnected && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-800">
            <p className="font-medium mb-2">Telnyx not connected</p>
            {!config.hasAllCredentials ? (
              <div className="text-xs space-y-1">
                <p className="font-medium">
                  Missing credentials in .env.local:
                </p>
                {!config.telnyxConfig.apiKey && (
                  <p>• NEXT_PUBLIC_TELNYX_API_KEY</p>
                )}
                {!config.telnyxConfig.sipUsername && (
                  <p>• NEXT_PUBLIC_TELNYX_SIP_USERNAME</p>
                )}
                {!config.telnyxConfig.sipPassword && (
                  <p>• NEXT_PUBLIC_TELNYX_SIP_PASSWORD</p>
                )}
                {!config.telnyxConfig.phoneNumber && (
                  <p>• NEXT_PUBLIC_TELNYX_PHONE_NUMBER</p>
                )}
              </div>
            ) : (
              <p className="text-xs">
                Credentials found but connection failed. Check network and try
                reconnecting.
              </p>
            )}
          </div>
        </div>
      )}

      {!telnyxActions.isInitializing &&
        telnyxActions.isConnected &&
        !telnyxActions.hasMicrophoneAccess && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm text-red-800">
              <p className="font-medium mb-2">Microphone access required</p>
              <p className="text-xs">
                Please allow microphone permissions to make calls
              </p>
            </div>
          </div>
        )}

      {telnyxActions.isCallActive && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-800">
            <p className="font-medium">Use the dial pad to send DTMF tones</p>
          </div>
        </div>
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

      {/* Modals */}
      {state.showAudioTest && (
        <AudioTest onClose={() => actions.setShowAudioTest(false)} />
      )}

      {state.showAudioSettings && (
        <AudioSettings
          isVisible={state.showAudioSettings}
          onClose={() => actions.setShowAudioSettings(false)}
        />
      )}

      {state.showDTMFSettings && (
        <DTMFSettings
          volume={0.3}
          onVolumeChange={(volume) => {}}
          enabled={true}
          onToggleEnabled={() => {}}
          onClose={() => actions.setShowDTMFSettings(false)}
        />
      )}

      {/* Error Popup Modal */}
      <ErrorPopup
        error={state.errorMessage}
        isVisible={state.showErrorPopup}
        onClose={logic.handleErrorPopupClose}
      />

      {/* Analytics Dashboard */}
      <CallAnalyticsDashboard
        callHistory={callHistory}
        userId={user?.id}
        isVisible={state.showAnalytics}
        onClose={() => actions.setShowAnalytics(false)}
      />
    </main>
  );
}
