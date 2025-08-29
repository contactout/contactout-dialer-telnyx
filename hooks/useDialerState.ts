import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface DialerState {
  // Phone number state
  phoneNumber: string;

  // UI visibility state
  showAudioTest: boolean;
  showAudioSettings: boolean;
  showDTMFSettings: boolean;
  showCallHistory: boolean;
  showAnalytics: boolean;
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
  setShowAnalytics: (show: boolean) => void;
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

export const useDialerState = (): [DialerState, DialerActions] => {
  const { user } = useAuth();

  // Phone number state
  const [phoneNumber, setPhoneNumberState] = useState("");

  // UI visibility state
  const [showAudioTest, setShowAudioTestState] = useState(false);
  const [showAudioSettings, setShowAudioSettingsState] = useState(false);
  const [showDTMFSettings, setShowDTMFSettingsState] = useState(false);
  const [showCallHistory, setShowCallHistoryState] = useState(false);
  const [showAnalytics, setShowAnalyticsState] = useState(false);
  const [showErrorPopup, setShowErrorPopupState] = useState(false);

  // Call state
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [autoRedirectCountdown, setAutoRedirectCountdown] = useState<
    number | null
  >(null);

  // Error state
  const [errorMessage, setErrorMessage] = useState("");

  // Configuration - memoized to prevent unnecessary re-renders
  const telnyxConfig = useRef({
    apiKey: process.env.NEXT_PUBLIC_TELNYX_API_KEY || "",
    sipUsername: process.env.NEXT_PUBLIC_TELNYX_SIP_USERNAME || "",
    sipPassword: process.env.NEXT_PUBLIC_TELNYX_SIP_PASSWORD || "",
    phoneNumber: process.env.NEXT_PUBLIC_TELNYX_PHONE_NUMBER || "",
  }).current;

  // Validate configuration on mount
  useEffect(() => {
    // Check for configuration issues
    if (telnyxConfig.phoneNumber === telnyxConfig.sipPassword) {
      console.error("WARNING: Phone number is set to SIP password value!");
      console.error(
        "This indicates an environment variable configuration issue."
      );
    }

    if (telnyxConfig.sipUsername === telnyxConfig.sipPassword) {
      console.error("WARNING: SIP username is set to SIP password value!");
      console.error(
        "This indicates an environment variable configuration issue."
      );
    }
  }, [telnyxConfig]);

  // Phone number actions
  const setPhoneNumber = useCallback((number: string) => {
    setPhoneNumberState(number);
  }, []);

  const clearPhoneNumber = useCallback(() => {
    setPhoneNumberState("");
  }, []);

  // UI visibility actions
  const setShowCallHistory = useCallback((show: boolean) => {
    setShowCallHistoryState(show);
  }, []);

  const setShowAnalytics = useCallback((show: boolean) => {
    setShowAnalyticsState(show);
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

  const setShowErrorPopup = useCallback((show: boolean) => {
    setShowErrorPopupState(show);
  }, []);

  // Error actions
  const clearError = useCallback(() => {
    setErrorMessage("");
  }, []);

  // Reset actions
  const resetCallState = useCallback(() => {
    setCallStartTime(null);
    setCallDuration(0);
    setAutoRedirectCountdown(null);
  }, []);

  const resetUIState = useCallback(() => {
    setShowAudioTestState(false);
    setShowAudioSettingsState(false);
    setShowDTMFSettingsState(false);
    setShowCallHistoryState(false);
    setShowAnalyticsState(false);
    setShowErrorPopupState(false);
  }, []);

  // State object
  const state: DialerState = {
    phoneNumber,
    showAudioTest,
    showAudioSettings,
    showDTMFSettings,
    showCallHistory,
    showAnalytics,
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
    setShowAnalytics,
    setShowErrorPopup,
    setCallStartTime,
    setCallDuration,
    setAutoRedirectCountdown,
    setErrorMessage,
    clearError,
    resetCallState,
    resetUIState,
  };

  return [state, actions];
};
