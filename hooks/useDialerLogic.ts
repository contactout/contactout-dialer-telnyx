import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DialerState, DialerActions } from "./useDialerState";
import { securityManager } from "@/lib/security";
import { logError } from "@/lib/errorHandler";

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

export const useDialerLogic = (
  state: DialerState,
  actions: DialerActions,
  telnyxActions: {
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
  }
): DialerLogic => {
  const { user } = useAuth();
  const userId = user?.id || "anonymous";
  const previousUserIdRef = useRef<string | null>(null);

  // Track user changes for debugging
  useEffect(() => {
    if (previousUserIdRef.current !== userId) {
      console.log("User ID changed:", {
        from: previousUserIdRef.current,
        to: userId,
      });
      previousUserIdRef.current = userId;
    }
  }, [userId]);

  // Phone number validation state
  const [isPhoneNumberValid, setIsPhoneNumberValid] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate phone number when it changes
  useEffect(() => {
    if (state.phoneNumber) {
      try {
        // Security validation first
        const securityValidation = securityManager.validatePhoneNumber(
          state.phoneNumber
        );

        if (securityValidation.riskLevel === "high") {
          setValidationError("Invalid phone number format detected");
          setIsPhoneNumberValid(false);
          logError("High risk phone number input detected", {
            level: "warning",
            category: "security",
            details: {
              input: state.phoneNumber,
              riskLevel: securityValidation.riskLevel,
            },
          });
          return;
        }

        // Basic validation
        const isValid =
          state.phoneNumber.length >= 7 &&
          /^[\d\s\-\(\)\+]+$/.test(state.phoneNumber);
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
          details: { input: state.phoneNumber, error },
        });
      }
    } else {
      setIsPhoneNumberValid(false);
      setValidationError(null);
    }
  }, [state.phoneNumber]);

  // Phone number handling
  const handleDigitPress = useCallback(
    (digit: string) => {
      if (telnyxActions.isCallActive) {
        // Send DTMF tone during active call
        telnyxActions.sendDTMF(digit);
        return;
      }

      // Security validation for phone number input
      const currentNumber = state.phoneNumber + digit;
      const securityValidation =
        securityManager.validatePhoneNumber(currentNumber);

      if (securityValidation.riskLevel === "high") {
        logError("High risk phone number input detected", {
          level: "warning",
          category: "security",
          details: {
            input: currentNumber,
            riskLevel: securityValidation.riskLevel,
          },
        });
        return; // Block high-risk input
      }

      // Rate limiting for digit input
      const rateLimit = securityManager.checkRateLimit(`digit_input_${userId}`);
      if (!rateLimit.isAllowed) {
        logError("Rate limit exceeded for digit input", {
          level: "warning",
          category: "security",
          details: { userId, rateLimit },
        });
        return;
      }

      // Clear any error messages when user starts typing
      if (telnyxActions.error) {
        telnyxActions.clearError();
      }

      // Update phone number
      actions.setPhoneNumber(currentNumber);
    },
    [state.phoneNumber, telnyxActions, actions, userId]
  );

  const handleBackspace = useCallback(() => {
    if (!telnyxActions.isCallActive) {
      // Remove the last digit from phone number
      actions.setPhoneNumber(state.phoneNumber.slice(0, -1));
      // Clear any error messages when user starts editing
      if (telnyxActions.error) {
        telnyxActions.clearError();
      }
    }
  }, [state.phoneNumber, telnyxActions, actions]);

  const handleCall = useCallback(() => {
    if (state.phoneNumber && isPhoneNumberValid) {
      // Final security validation before making call
      const securityValidation = securityManager.validatePhoneNumber(
        state.phoneNumber
      );

      if (securityValidation.riskLevel === "high") {
        logError("Call blocked due to high-risk phone number", {
          level: "error",
          category: "security",
          details: {
            input: state.phoneNumber,
            riskLevel: securityValidation.riskLevel,
          },
        });
        return;
      }

      // Rate limiting for call attempts
      const rateLimit = securityManager.checkRateLimit(
        `call_attempt_${userId}`
      );
      if (!rateLimit.isAllowed) {
        const errorMessage =
          "Too many call attempts. Please wait before trying again.";
        actions.setErrorMessage(errorMessage);
        actions.setShowErrorPopup(true);
        logError("Call rate limit exceeded", {
          level: "warning",
          category: "security",
          details: { userId, rateLimit },
        });
        return;
      }

      telnyxActions.makeCall(state.phoneNumber);
    }
  }, [state.phoneNumber, isPhoneNumberValid, telnyxActions, actions, userId]);

  const handleHangup = useCallback(() => {
    telnyxActions.hangupCall();
    // Only clear phone number if there's no call failure error
    if (
      !telnyxActions.error ||
      (!telnyxActions.error.includes("failed") &&
        !telnyxActions.error.includes("invalid"))
    ) {
      actions.setPhoneNumber("");
      actions.setAutoRedirectCountdown(null);
    }
  }, [telnyxActions, actions]);

  const handleClearNumber = useCallback(() => {
    if (!telnyxActions.isCallActive) {
      actions.setPhoneNumber("");
      // Clear any error messages when clearing the number
      if (telnyxActions.error) {
        telnyxActions.clearError();
      }
    }
  }, [telnyxActions, actions]);

  // Call history handling
  const handleRedial = useCallback(
    (phoneNumber: string) => {
      actions.setPhoneNumber(phoneNumber);
      actions.setShowCallHistory(false);
    },
    [actions]
  );

  // Error handling
  const handleErrorPopupClose = useCallback(() => {
    console.log("🚨 Error popup close handler called");
    actions.setShowErrorPopup(false);
    actions.setErrorMessage("");
    telnyxActions.clearError();
    // Complete the call failure and return to dialpad
    telnyxActions.completeCallFailure();
    actions.setPhoneNumber("");
    actions.setAutoRedirectCountdown(null);
    console.log("🚨 Error popup closed, returning to dialpad");
  }, [actions, telnyxActions]);

  return {
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
};
