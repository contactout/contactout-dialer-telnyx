"use client";

import { useState, useEffect, useRef } from "react";
import DialPad from "@/components/DialPad";
import PhoneMockup from "@/components/PhoneMockup";
import LoginScreen from "@/components/LoginScreen";
import CallingScreen from "@/components/CallingScreen";
import AudioTest from "@/components/AudioTest";
import SettingsDropdown from "@/components/SettingsDropdown";
import CallHistory from "@/components/CallHistory";
import ErrorPopup from "@/components/ErrorPopup";
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
  const [adminStatusChecked, setAdminStatusChecked] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState<
    number | null
  >(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { isMobile } = useDeviceDetection();
  const { user, loading, signOut, session } = useAuth();

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

  // Check if phone number is incorrectly set to SIP password
  if (telnyxConfig.phoneNumber === telnyxConfig.sipPassword) {
    console.error("WARNING: Phone number is set to SIP password value!");
    console.error(
      "This indicates an environment variable configuration issue."
    );
  }

  // Check if SIP username is incorrectly set to SIP password
  if (telnyxConfig.sipUsername === telnyxConfig.sipPassword) {
    console.error("WARNING: SIP username is set to SIP password value!");
    console.error(
      "This indicates an environment variable configuration issue."
    );
  }

  // Check if all required credentials are present
  const hasAllCredentials =
    telnyxConfig.apiKey &&
    telnyxConfig.sipUsername &&
    telnyxConfig.sipPassword &&
    telnyxConfig.phoneNumber;

  const {
    isConnected,
    isCallActive,
    isConnecting,
    isInitializing,
    error,
    hasMicrophoneAccess,
    callControlId,
    callState,
    makeCall,
    hangupCall,
    sendDTMF,
    debugAudioSetup,
    retryCall,
    networkQuality,
    isReconnecting,
    forceResetCallState,
    completeCallFailure,
    clearError,
    triggerReconnection,
    retryMicrophoneAccess,
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

  // Auto-reset call state when there are errors to prevent UI from getting stuck
  useEffect(() => {
    if (error && (isConnecting || isCallActive)) {
      console.log("🚨 ERROR DETECTED in main page:", {
        error,
        isConnecting,
        isCallActive,
        callState,
      });

      // Check if this is a call failure error that should show popup
      const isCallFailure =
        error.includes("invalid") ||
        error.includes("failed") ||
        error.includes("rejected") ||
        error.includes("busy") ||
        error.includes("no-answer") ||
        error.includes("timeout");

      console.log("🚨 Error type check:", { isCallFailure, error });

      if (isCallFailure) {
        // For call failures, show error popup instead of auto-redirecting
        console.log("🚨 Setting error popup for call failure");
        setErrorMessage(error);
        setShowErrorPopup(true);
        // Don't auto-redirect - let user control when to return to dialpad
        setAutoRedirectCountdown(null);
      } else {
        // For other errors, just reset after 2 seconds
        console.log("🚨 Non-call failure error, will auto-reset");
        const resetTimeout = setTimeout(() => {
          forceResetCallState();
        }, 2000);

        return () => clearTimeout(resetTimeout);
      }
    }
  }, [error, isConnecting, isCallActive, forceResetCallState, callState]);

  // Safety timeout to prevent calling screen from getting stuck indefinitely
  useEffect(() => {
    if (isConnecting && !isCallActive) {
      const safetyTimeout = setTimeout(() => {
        forceResetCallState();
      }, 10000); // 10 seconds safety timeout

      return () => clearTimeout(safetyTimeout);
    }
  }, [isConnecting, isCallActive, forceResetCallState]);

  // Clear countdown when call state changes to idle
  useEffect(() => {
    if (callState === "idle") {
      setAutoRedirectCountdown(null);
    }
  }, [callState]);

  // Check admin status when user changes
  useEffect(() => {
    let isMounted = true;
    let adminCheckTimeout: NodeJS.Timeout | null = null;
    const currentUserId = user?.id;

    const checkAdminStatus = async () => {
      if (!user || !isMounted || adminStatusChecked) return;

      // Prevent multiple simultaneous admin checks
      if (adminCheckTimeout) {
        return;
      }

      try {
        // Set a timeout to prevent rapid repeated calls
        adminCheckTimeout = setTimeout(() => {
          adminCheckTimeout = null;
        }, 5000); // 5 second cooldown

        const adminStatus = await DatabaseService.isUserAdmin(user.id);

        if (isMounted) {
          // Only update admin status if it's different from current
          // This prevents unnecessary state changes that could trigger re-renders
          if (adminStatus !== isAdmin) {
            setIsAdmin(adminStatus);
          }
          setAdminStatusChecked(true); // Mark as checked to prevent repeated calls
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error checking admin status:", error);
          // Fallback to email-based admin check
          const fallbackAdmin = user.email?.includes("admin") || false;
          // Only update admin status if it's different from current
          if (fallbackAdmin !== isAdmin) {
            setIsAdmin(fallbackAdmin);
          }
          setAdminStatusChecked(true); // Mark as checked even on error

          // If it's a network error, set a longer cooldown
          if (
            error instanceof Error &&
            error.message.includes("Failed to fetch")
          ) {
            // Set a longer cooldown for network errors to prevent infinite loops
            setTimeout(() => {
              setAdminStatusChecked(false);
            }, 60000); // 1 minute cooldown for network errors
          }
        }
      } finally {
        // Clear the timeout
        if (adminCheckTimeout) {
          clearTimeout(adminCheckTimeout);
          adminCheckTimeout = null;
        }
      }
    };

    // Only check admin status if we have a user and haven't checked recently
    if (user && user.id && !adminStatusChecked) {
      checkAdminStatus();
    } else if (!user && !session) {
      // Only reset admin status when user is completely logged out
      // Check both user and session to ensure we're really logged out
      setIsAdmin(false);
      setAdminStatusChecked(false);
      previousUserIdRef.current = null;
    }

    // Track user ID changes to prevent unnecessary admin status resets
    if (user?.id !== previousUserIdRef.current) {
      previousUserIdRef.current = user?.id || null;
    }

    // Don't reset admin status if user is still logged in but user object changes
    // This prevents admin status from being reset during auth state updates

    return () => {
      isMounted = false;
      if (adminCheckTimeout) {
        clearTimeout(adminCheckTimeout);
      }
    };
  }, [user?.id, adminStatusChecked]); // Include adminStatusChecked in dependencies

  // Auto-return logic removed - now handled by error popup with user control

  // Update call duration when call is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isCallActive && callStartTime) {
      interval = setInterval(() => {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        setCallDuration(duration);
      }, 1000);
    } else {
      setCallDuration(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCallActive, callStartTime]);

  // Monitor network quality and apply graceful degradation

  // Global error boundary for admin status checking
  useEffect(() => {
    // If we've had multiple failed admin checks, disable them temporarily
    if (adminStatusChecked === false && user?.id) {
      // Add a safety timeout to prevent infinite loops
      const safetyTimeout = setTimeout(() => {
        setIsAdmin(false);
        setAdminStatusChecked(true);
      }, 10000); // 10 second safety timeout

      return () => clearTimeout(safetyTimeout);
    }
  }, [adminStatusChecked, user?.id]);

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
      // Clear any error messages when user starts typing
      if (error) {
        clearError();
      }
    }
  };

  const handleBackspace = () => {
    if (!isCallActive) {
      // Remove the last digit from phone number
      setPhoneNumber((prev) => prev.slice(0, -1));
      // Clear any error messages when user starts editing
      if (error) {
        clearError();
      }
    }
  };

  const handleCall = () => {
    if (phoneNumber) {
      makeCall(phoneNumber);
    }
  };

  const handleHangup = () => {
    hangupCall();
    // Only clear phone number if there's no call failure error
    if (!error || (!error.includes("failed") && !error.includes("invalid"))) {
      setPhoneNumber("");
      setAutoRedirectCountdown(null);
    }
    // Don't clear error immediately - let the user see what happened
    // The error will be cleared by the error popup when user clicks OK
  };

  const handleClearNumber = () => {
    if (!isCallActive) {
      setPhoneNumber("");
      // Clear any error messages when clearing the number
      if (error) {
        clearError();
      }
    }
  };

  // Call history functions
  const handleRedial = (phoneNumber: string) => {
    setPhoneNumber(phoneNumber);
    setShowCallHistory(false);
  };

  const handleRemoveCall = (timestamp: number) => {
    removeCall(timestamp);
    // Clear error if this was the last call in history
    if (callHistory.length <= 1) {
      clearError();
    }
  };

  const handleClearHistory = () => {
    clearHistory();
    // Also clear any error messages when clearing history
    clearError();
  };

  // Handle error popup close
  const handleErrorPopupClose = () => {
    console.log("🚨 Error popup close handler called");
    setShowErrorPopup(false);
    setErrorMessage("");
    clearError();
    // Complete the call failure and return to dialpad
    completeCallFailure();
    setPhoneNumber("");
    setAutoRedirectCountdown(null);
    console.log("🚨 Error popup closed, returning to dialpad");
  };

  // Show calling screen when connecting OR when call is active
  if (isConnecting || isCallActive) {
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
                isInitializing
                  ? "Initializing..."
                  : isConnected
                  ? "Connected"
                  : "Disconnected"
              }
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isInitializing
                    ? "bg-yellow-500"
                    : isConnected
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

        {/* Calling Screen */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <CallingScreen
            phoneNumber={phoneNumber}
            onHangup={handleHangup}
            error={error}
            onReturnToDialPad={() => {
              // Only return to dialpad if there's no call failure error
              if (
                !error ||
                (!error.includes("failed") && !error.includes("invalid"))
              ) {
                forceResetCallState();
                setPhoneNumber("");
                setAutoRedirectCountdown(null);
                clearError();
              }
              // If there's a call failure error, let the error popup handle the navigation
            }}
            onRetry={() => {
              // Retry the call with error recovery
              if (phoneNumber) {
                retryCall(phoneNumber, 3);
              }
            }}
            isConnecting={isConnecting}
            isCallActive={isCallActive}
            callState={callState || ""}
            callDuration={callDuration}
            autoRedirectCountdown={autoRedirectCountdown}
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
              isInitializing
                ? "Initializing..."
                : isConnected
                ? "Connected"
                : "Disconnected"
            }
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isInitializing
                  ? "bg-yellow-500"
                  : isConnected
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

      {/* Error Display - Only show non-call errors here */}
      {error && !error.includes("failed") && !error.includes("invalid") && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm text-center">
          <div className="mb-2">{error}</div>

          {/* Action buttons for different error types */}
          <div className="flex gap-2 justify-center">
            {/* Reconnection button for connection errors */}
            {(!isConnected ||
              error.includes("connection") ||
              error.includes("reconnect")) && (
              <button
                onClick={triggerReconnection}
                disabled={isReconnecting || isInitializing}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-xs rounded-lg transition-colors"
              >
                {isReconnecting ? "Reconnecting..." : "Reconnect"}
              </button>
            )}

            {/* Microphone retry button for microphone errors */}
            {(!hasMicrophoneAccess ||
              error.includes("microphone") ||
              error.includes("Microphone")) && (
              <button
                onClick={retryMicrophoneAccess}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition-colors"
              >
                Retry Microphone
              </button>
            )}
          </div>
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
        <div className="flex-1 flex flex-col justify-between">
          {/* Dial Pad */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <DialPad
              phoneNumber={phoneNumber}
              onDigitPress={handleDigitPress}
              onBackspace={handleBackspace}
              onCall={handleCall}
              onHangup={handleHangup}
              onClear={handleClearNumber}
              isCallActive={isCallActive}
              isConnecting={isConnecting}
              isInitializing={isInitializing}
              isConnected={isConnected}
              hasMicrophoneAccess={hasMicrophoneAccess}
            />
          </div>

          {/* Instructions */}
          <div className="text-center text-sm text-gray-500 py-4">
            {isInitializing && (
              <p className="text-yellow-600">
                Initializing Telnyx connection...
              </p>
            )}
            {!isInitializing && !isConnected && (
              <div className="space-y-2">
                <p className="text-red-600 font-medium">Telnyx not connected</p>
                {!hasAllCredentials ? (
                  <div className="text-xs space-y-1">
                    <p className="font-medium">
                      Missing credentials in .env.local:
                    </p>
                    {!telnyxConfig.apiKey && (
                      <p>• NEXT_PUBLIC_TELNYX_API_KEY</p>
                    )}
                    {!telnyxConfig.sipUsername && (
                      <p>• NEXT_PUBLIC_TELNYX_SIP_USERNAME</p>
                    )}
                    {!telnyxConfig.sipPassword && (
                      <p>• NEXT_PUBLIC_TELNYX_SIP_PASSWORD</p>
                    )}
                    {!telnyxConfig.phoneNumber && (
                      <p>• NEXT_PUBLIC_TELNYX_PHONE_NUMBER</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs">
                    Credentials found but connection failed. Check network and
                    try reconnecting.
                  </p>
                )}
              </div>
            )}
            {!isInitializing && isConnected && !hasMicrophoneAccess && (
              <div className="space-y-2">
                <p className="text-red-600 font-medium">
                  Microphone access required
                </p>
                <p className="text-xs">
                  Please allow microphone permissions to make calls
                </p>
              </div>
            )}

            {isCallActive && (
              <p className="text-green-600 font-medium">
                Use the dial pad to send DTMF tones
              </p>
            )}
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
      {/* Audio Test Modal */}
      {showAudioTest && <AudioTest onClose={() => setShowAudioTest(false)} />}

      {/* DTMF Settings Modal */}
      {showDTMFSettings && (
        <DTMFSettings
          volume={0.3}
          onVolumeChange={(volume) => {}}
          enabled={true}
          onToggleEnabled={() => {}}
          onClose={() => setShowDTMFSettings(false)}
        />
      )}

      {/* Error Popup Modal */}
      <ErrorPopup
        error={errorMessage}
        isVisible={showErrorPopup}
        onClose={handleErrorPopupClose}
      />
    </main>
  );
}
