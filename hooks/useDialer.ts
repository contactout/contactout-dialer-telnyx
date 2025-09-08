import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { securityManager } from "@/lib/security";
import { logError } from "@/lib/errorHandler";

export interface DialerState {
  // Phone number state
  phoneNumber: string;

  // UI visibility state
  showAudioTest: boolean;
  showAudioSettings: boolean;
  showDTMFSettings: boolean;
  showCallHistory: boolean;
  showErrorPopup: boolean;

  // Call state
  callStartTime: number | null;
  callDuration: number;
  autoRedirectCountdown: number | null;

  // Error state
  errorMessage: string;

  // Configuration
  telnyxConfig: {
    apiKey: string;
    sipUsername: string;
    sipPassword: string;
    phoneNumber: string;
  };
}

export interface DialerActions {
  // Phone number actions
  setPhoneNumber: (number: string) => void;
  clearPhoneNumber: () => void;

  // UI visibility actions
  setShowAudioTest: (show: boolean) => void;
  setShowAudioSettings: (show: boolean) => void;
  setShowDTMFSettings: (show: boolean) => void;
  setShowCallHistory: (show: boolean) => void;
  setShowErrorPopup: (show: boolean) => void;

  // Call actions
  setCallStartTime: (time: number | null) => void;
  setCallDuration: (duration: number) => void;
  setAutoRedirectCountdown: (countdown: number | null) => void;

  // Error actions
  setErrorMessage: (message: string) => void;
  clearError: () => void;

  // Utility actions
  resetCallState: () => void;
  resetUIState: () => void;
}

export interface DialerLogic {
  // Phone number handling
  handleDigitPress: (digit: string) => void;
  handleBackspace: () => void;
  handleCall: () => void;
  handleHangup: () => void;
  handleClearNumber: () => void;

  // Call history handling
  handleRedial: (phoneNumber: string) => void;

  // Error handling
  handleErrorPopupClose: () => void;

  // Validation
  isPhoneNumberValid: boolean;
  validationError: string | null;
}

export const useDialer = (telnyxActions: {
  makeCall: (phoneNumber: string) => Promise<void>;
  hangupCall: () => void;
  sendDTMF: (digit: string) => void;
  retryCall: (phoneNumber: string, maxRetries?: number) => Promise<void>;
  clearError: () => void;
  forceResetCallState: () => void;
  completeCallFailure: () => void;
  retryMicrophoneAccess: () => void;
  triggerReconnection: () => void;
  error: string | null;
  isConnecting: boolean;
  isCallActive: boolean;
  callState: string;
  hasMicrophoneAccess: boolean;
}): [DialerState, DialerActions, DialerLogic] => {
  const { user } = useAuth();
  const userId = user?.id || "anonymous";
  const previousUserIdRef = useRef<string | null>(null);

  // Phone number state
  const [phoneNumber, setPhoneNumberState] = useState("");

  // UI visibility state
  const [showAudioTest, setShowAudioTestState] = useState(false);
  const [showAudioSettings, setShowAudioSettingsState] = useState(false);
  const [showDTMFSettings, setShowDTMFSettingsState] = useState(false);
  const [showCallHistory, setShowCallHistoryState] = useState(false);
  const [showErrorPopup, setShowErrorPopupState] = useState(false);

  // Call state
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState<
    number | null
  >(null);

  // Error state
  const [errorMessage, setErrorMessage] = useState("");

  // Phone number validation state
  const [isPhoneNumberValid, setIsPhoneNumberValid] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Configuration - memoized to prevent unnecessary re-renders
  const telnyxConfig = useRef({
    apiKey: process.env.NEXT_PUBLIC_TELNYX_API_KEY || "",
    sipUsername: process.env.NEXT_PUBLIC_TELNYX_SIP_USERNAME || "",
    sipPassword: process.env.NEXT_PUBLIC_TELNYX_SIP_PASSWORD || "",
    phoneNumber: process.env.NEXT_PUBLIC_TELNYX_PHONE_NUMBER || "",
  }).current;

  // Validate phone number when it changes
  useEffect(() => {
    if (phoneNumber) {
      try {
        // Basic validation
        const isValid =
          phoneNumber.length >= 7 && /^[\d\s\-\(\)\+]+$/.test(phoneNumber);
        setIsPhoneNumberValid(isValid);
        setValidationError(
          isValid ? null : "Phone number must be at least 7 digits"
        );
      } catch (error) {
        setValidationError("Error validating phone number");
        setIsPhoneNumberValid(false);
        logError("Phone number validation error", {
          level: "error",
          category: "validation",
          details: { input: phoneNumber, error },
        });
      }
    } else {
      setValidationError("");
      setIsPhoneNumberValid(false);
    }
  }, [phoneNumber]);

  // Actions
  const setPhoneNumber = useCallback((number: string) => {
    setPhoneNumberState(number);
  }, []);

  const clearPhoneNumber = useCallback(() => {
    setPhoneNumberState("");
  }, []);

  const setShowAudioTest = useCallback((show: boolean) => {
    setShowAudioTestState(show);
  }, []);

  const setShowAudioSettings = useCallback((show: boolean) => {
    setShowAudioSettingsState(show);
  }, []);

  const setShowDTMFSettings = useCallback((show: boolean) => {
    setShowDTMFSettingsState(show);
  }, []);

  const setShowCallHistory = useCallback((show: boolean) => {
    setShowCallHistoryState(show);
  }, []);

  const setShowErrorPopup = useCallback((show: boolean) => {
    setShowErrorPopupState(show);
  }, []);

  const setCallStartTimeAction = useCallback((time: number | null) => {
    setCallStartTime(time);
  }, []);

  const setCallDurationAction = useCallback((duration: number) => {
    setCallDuration(duration);
  }, []);

  const setAutoRedirectCountdownAction = useCallback(
    (countdown: number | null) => {
      setAutoRedirectCountdown(countdown);
    },
    []
  );

  const setErrorMessageAction = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  // Helper function to show error popup and log error
  const showError = useCallback(
    (message: string, errorDetails?: any) => {
      setErrorMessageAction(message);
      setShowErrorPopup(true);
      if (errorDetails) {
        logError(message, errorDetails);
      }
    },
    [setErrorMessageAction, setShowErrorPopup]
  );

  const clearErrorAction = useCallback(() => {
    setErrorMessage("");
  }, []);

  const resetCallState = useCallback(() => {
    setCallStartTime(null);
    setCallDuration(0);
    setAutoRedirectCountdown(null);
  }, []);

  const resetUIState = useCallback(() => {
    setShowAudioTest(false);
    setShowAudioSettings(false);
    setShowDTMFSettings(false);
    setShowCallHistory(false);
    setShowErrorPopup(false);
  }, [
    setShowAudioSettings,
    setShowAudioTest,
    setShowCallHistory,
    setShowDTMFSettings,
    setShowErrorPopup,
  ]);

  // Business Logic
  const handleDigitPress = useCallback(
    (digit: string) => {
      if (telnyxActions.isCallActive) {
        // Send DTMF tone during active call
        telnyxActions.sendDTMF(digit);
      } else {
        // Add digit to phone number when not in call
        setPhoneNumber(phoneNumber + digit);
      }
    },
    [phoneNumber, setPhoneNumber, telnyxActions]
  );

  const handleBackspace = useCallback(() => {
    if (phoneNumber.length > 0) {
      setPhoneNumber(phoneNumber.slice(0, -1));
    }
  }, [phoneNumber, setPhoneNumber]);

  const handleCall = useCallback(() => {
    if (!isPhoneNumberValid || !phoneNumber) {
      setErrorMessageAction("Please enter a valid phone number");
      return;
    }

    // CRITICAL FIX: Prevent duplicate calls with more comprehensive checks
    if (telnyxActions.isConnecting || telnyxActions.isCallActive) {
      setErrorMessageAction("Call already in progress");
      return;
    }

    // IMPROVED: Allow calls when in ended state (which should auto-transition to idle)
    if (
      telnyxActions.callState !== "idle" &&
      telnyxActions.callState !== "ended"
    ) {
      setErrorMessageAction("Please wait for current call to complete");
      return;
    }

    // ADDITIONAL: If stuck in ended state, force transition to idle
    if (telnyxActions.callState === "ended") {
      console.log("🔄 Detected ended state, forcing reset before new call");
      telnyxActions.forceResetCallState();
    }

    if (!telnyxActions.hasMicrophoneAccess) {
      setErrorMessageAction("Microphone access required");
      return;
    }

    try {
      // Security validation
      const securityValidation =
        securityManager.validatePhoneNumber(phoneNumber);
      if (securityValidation.riskLevel === "high") {
        setErrorMessageAction("Invalid phone number format");
        return;
      }

      // Rate limiting for call attempts
      const rateLimit = securityManager.checkRateLimit(
        `call_attempt_${userId}`
      );
      if (!rateLimit.isAllowed) {
        showError("Too many call attempts. Please wait before trying again.", {
          level: "warning",
          category: "security",
          details: { userId, rateLimit },
        });
        return;
      }

      telnyxActions.makeCall(phoneNumber);
    } catch (error) {
      showError("Error initiating call", {
        level: "error",
        category: "call",
        details: { phoneNumber, error },
      });
    }
  }, [
    phoneNumber,
    isPhoneNumberValid,
    telnyxActions,
    userId,
    setErrorMessageAction,
    showError,
  ]);

  const handleHangup = useCallback(() => {
    telnyxActions.hangupCall();
    // Only clear phone number if there's no call failure error
    if (
      !telnyxActions.error ||
      (!telnyxActions.error.includes("failed") &&
        !telnyxActions.error.includes("invalid"))
    ) {
      setPhoneNumber("");
      setAutoRedirectCountdownAction(null);
    }
  }, [telnyxActions, setPhoneNumber, setAutoRedirectCountdownAction]);

  const handleClearNumber = useCallback(() => {
    if (!telnyxActions.isCallActive) {
      setPhoneNumber("");
      // Clear any error messages when clearing the number
      if (telnyxActions.error) {
        telnyxActions.clearError();
      }
    }
  }, [telnyxActions, setPhoneNumber]);

  const handleRedial = useCallback(
    (phoneNumber: string) => {
      setPhoneNumber(phoneNumber);
      setShowCallHistory(false);
    },
    [setPhoneNumber, setShowCallHistory]
  );

  const handleErrorPopupClose = useCallback(() => {
    setShowErrorPopup(false);
    setErrorMessageAction("");
    telnyxActions.clearError();
    // Complete the call failure and return to dialpad
    telnyxActions.completeCallFailure();
    setPhoneNumber("");
    setAutoRedirectCountdownAction(null);
  }, [
    telnyxActions,
    setShowErrorPopup,
    setErrorMessageAction,
    setPhoneNumber,
    setAutoRedirectCountdownAction,
  ]);

  // State object
  const state: DialerState = {
    phoneNumber,
    showAudioTest,
    showAudioSettings,
    showDTMFSettings,
    showCallHistory,
    showErrorPopup,
    callStartTime,
    callDuration,
    autoRedirectCountdown,
    errorMessage,
    telnyxConfig,
  };

  // Actions object
  const actions: DialerActions = {
    setPhoneNumber,
    clearPhoneNumber,
    setShowAudioTest,
    setShowAudioSettings,
    setShowDTMFSettings,
    setShowCallHistory,
    setShowErrorPopup,
    setCallStartTime: setCallStartTimeAction,
    setCallDuration: setCallDurationAction,
    setAutoRedirectCountdown: setAutoRedirectCountdownAction,
    setErrorMessage: setErrorMessageAction,
    clearError: clearErrorAction,
    resetCallState,
    resetUIState,
  };

  // Logic object
  const logic: DialerLogic = {
    handleDigitPress,
    handleBackspace,
    handleCall,
    handleHangup,
    handleClearNumber,
    handleRedial,
    handleErrorPopupClose,
    isPhoneNumberValid,
    validationError,
  };

  // Effects - placed after all actions are defined to avoid circular dependencies
  useEffect(() => {
    if (telnyxActions.error) {
      console.log("🔍 useDialer - Error received:", telnyxActions.error);
      console.log("🔍 useDialer - Call state:", telnyxActions.callState);
      console.log("🔍 useDialer - Is connecting:", telnyxActions.isConnecting);
      console.log("🔍 useDialer - Is call active:", telnyxActions.isCallActive);

      // CRITICAL FIX: More conservative error handling
      // Only show error popup for actual call failures, not during active calls
      const isCallFailure =
        telnyxActions.error.includes("invalid") ||
        telnyxActions.error.includes("failed") ||
        telnyxActions.error.includes("rejected") ||
        telnyxActions.error.includes("busy") ||
        telnyxActions.error.includes("no-answer") ||
        telnyxActions.error.includes("timeout") ||
        telnyxActions.error.includes("voice mail") ||
        telnyxActions.error.includes("User hung up") ||
        telnyxActions.error.includes("Message left") ||
        telnyxActions.error.includes("Call rejected") ||
        telnyxActions.error.includes("declined");

      console.log("🔍 useDialer - Is call failure:", isCallFailure);

      // CRITICAL FIX: Show error popup for call failures, including rejections
      if (isCallFailure) {
        console.log("🔍 useDialer - Showing error popup:", telnyxActions.error);
        // For call failures (including rejections), always show error popup
        showError(telnyxActions.error);

        // Force reset if we're still in a call state
        if (telnyxActions.isConnecting || telnyxActions.isCallActive) {
          telnyxActions.forceResetCallState();
        }
      } else if (telnyxActions.isConnecting && !telnyxActions.isCallActive) {
        // For other errors during connecting (but not active calls), just reset after 1.5 seconds
        const resetTimeout = setTimeout(() => {
          telnyxActions.forceResetCallState();
        }, 1500);

        return () => clearTimeout(resetTimeout);
      }
      // CRITICAL FIX: Don't handle errors during active calls - let the call continue
    }
  }, [
    telnyxActions.error,
    telnyxActions.isConnecting,
    telnyxActions.isCallActive,
    telnyxActions.forceResetCallState,
    showError,
    telnyxActions,
  ]);

  // REMOVED: Safety timeout - UI should be in sync with Telnyx call status
  // The UI state should be driven by Telnyx events, not timeouts
  // useEffect(() => {
  //   // Safety timeout logic removed - relying on event-driven state synchronization
  // }, []);

  // REMOVED: Early failure detection timeout - UI should be in sync with Telnyx call status
  // The UI state should be driven by Telnyx events, not timeouts
  // useEffect(() => {
  //   // Early failure detection logic removed - relying on event-driven state synchronization
  // }, []);

  // CRITICAL FIX: Add error recovery mechanisms
  const attemptErrorRecovery = useCallback(async () => {
    console.log("🔄 Attempting error recovery...");

    try {
      // Check if we can retry microphone access
      if (telnyxActions.retryMicrophoneAccess) {
        await telnyxActions.retryMicrophoneAccess();
        console.log("✅ Microphone access retry attempted");
        return true;
      }

      // Check if we can validate current state
      if (telnyxActions.hasMicrophoneAccess) {
        console.log("✅ Microphone access is available");
        return true;
      }

      // If we're in a stuck state, try to reset
      if (telnyxActions.isConnecting && !telnyxActions.isCallActive) {
        console.log("🔄 Resetting stuck call state");
        telnyxActions.forceResetCallState();
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error recovery failed:", error);
      return false;
    }
  }, [telnyxActions]);

  // DISABLED: Auto-recovery for common error states to prevent duplicate calls
  // Users should manually retry calls instead of automatic recovery
  // useEffect(() => {
  //   if (telnyxActions.error && !telnyxActions.isCallActive) {
  //     // Wait a bit before attempting recovery to avoid rapid retries
  //     const recoveryTimeout = setTimeout(() => {
  //       attemptErrorRecovery();
  //     }, 2000);

  //     return () => clearTimeout(recoveryTimeout);
  //   }
  // }, [telnyxActions.error, telnyxActions.isCallActive, attemptErrorRecovery]);

  // Voice mail detection and handling
  useEffect(() => {
    if (telnyxActions.callState === "voicemail") {
      // Show voice mail notification
      showError("Call forwarded to voice mail - You can leave a message");

      // Auto-hide after 5 seconds for voice mail
      const voiceMailTimeout = setTimeout(() => {
        setShowErrorPopup(false);
        setErrorMessageAction("");
      }, 5000);

      return () => clearTimeout(voiceMailTimeout);
    }
  }, [
    telnyxActions.callState,
    showError,
    setShowErrorPopup,
    setErrorMessageAction,
  ]);

  // Clear countdown when call state changes to idle
  useEffect(() => {
    if (telnyxActions.callState === "idle") {
      setAutoRedirectCountdownAction(null);
    }
  }, [telnyxActions.callState, setAutoRedirectCountdownAction]);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStartTime && telnyxActions.isCallActive) {
      interval = setInterval(() => {
        setCallDurationAction((Date.now() - callStartTime) / 1000);
      }, 1000);
    } else {
      setCallDurationAction(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStartTime, telnyxActions.isCallActive, setCallDurationAction]);

  // Add error recovery to actions
  const enhancedActions = {
    ...actions,
    attemptErrorRecovery,
  };

  return [state, enhancedActions, logic];
};
