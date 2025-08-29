import { useEffect, useCallback } from "react";
import { DialerState, DialerActions } from "./useDialerState";

export interface DialerEffects {
  // Effect cleanup functions
  cleanupEffects: () => void;
}

export const useDialerEffects = (
  state: DialerState,
  actions: DialerActions,
  telnyxActions: {
    error: string | null;
    isConnecting: boolean;
    isCallActive: boolean;
    callState: string;
    forceResetCallState: () => void;
    clearError: () => void;
  }
): DialerEffects => {
  // Auto-reset call state when there are errors to prevent UI from getting stuck
  useEffect(() => {
    if (
      telnyxActions.error &&
      (telnyxActions.isConnecting || telnyxActions.isCallActive)
    ) {
      // Check if this is a call failure error that should show popup
      const isCallFailure =
        telnyxActions.error.includes("invalid") ||
        telnyxActions.error.includes("failed") ||
        telnyxActions.error.includes("rejected") ||
        telnyxActions.error.includes("busy") ||
        telnyxActions.error.includes("no-answer") ||
        telnyxActions.error.includes("timeout");

      if (isCallFailure) {
        // For call failures, immediately redirect to dialpad and show error popup
        actions.setErrorMessage(telnyxActions.error);
        actions.setShowErrorPopup(true);
        // Force immediate return to dialpad
        telnyxActions.forceResetCallState();
      } else {
        // For other errors, just reset after 1.5 seconds
        const resetTimeout = setTimeout(() => {
          telnyxActions.forceResetCallState();
        }, 1500);

        return () => clearTimeout(resetTimeout);
      }
    }
  }, [
    telnyxActions.error,
    telnyxActions.isConnecting,
    telnyxActions.isCallActive,
    telnyxActions.forceResetCallState,
    actions,
  ]);

  // Safety timeout to prevent calling screen from getting stuck indefinitely
  useEffect(() => {
    if (telnyxActions.isConnecting && !telnyxActions.isCallActive) {
      const safetyTimeout = setTimeout(() => {
        telnyxActions.forceResetCallState();
      }, 5000); // 5 seconds safety timeout (reduced from 10s)

      return () => clearTimeout(safetyTimeout);
    }
  }, [
    telnyxActions.isConnecting,
    telnyxActions.isCallActive,
    telnyxActions.forceResetCallState,
  ]);

  // Early failure detection for calls stuck in "trying" state
  useEffect(() => {
    if (telnyxActions.callState === "trying" && !telnyxActions.isCallActive) {
      const earlyFailureTimeout = setTimeout(() => {
        // If call has been in "trying" state for more than 2 seconds, force failure
        actions.setErrorMessage("Call failed - Number not reachable");
        actions.setShowErrorPopup(true);
        telnyxActions.forceResetCallState();
      }, 2000); // 2 seconds for early failure detection

      return () => clearTimeout(earlyFailureTimeout);
    }
  }, [
    telnyxActions.callState,
    telnyxActions.isCallActive,
    actions,
    telnyxActions.forceResetCallState,
  ]);

  // Clear countdown when call state changes to idle
  useEffect(() => {
    if (telnyxActions.callState === "idle") {
      actions.setAutoRedirectCountdown(null);
    }
  }, [telnyxActions.callState, actions]);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (telnyxActions.isCallActive && state.callStartTime) {
      interval = setInterval(() => {
        const duration = Math.floor((Date.now() - state.callStartTime!) / 1000);
        actions.setCallDuration(duration);
      }, 1000);
    } else {
      actions.setCallDuration(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [telnyxActions.isCallActive, state.callStartTime, actions]);

  // Auto-redirect countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (
      state.autoRedirectCountdown !== null &&
      state.autoRedirectCountdown > 0
    ) {
      interval = setInterval(() => {
        const newCountdown = state.autoRedirectCountdown! - 1;
        if (newCountdown <= 0) {
          actions.setAutoRedirectCountdown(null);
          telnyxActions.forceResetCallState();
        } else {
          actions.setAutoRedirectCountdown(newCountdown);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [state.autoRedirectCountdown, actions, telnyxActions]);

  // Cleanup function for all effects
  const cleanupEffects = useCallback(() => {
    actions.setAutoRedirectCountdown(null);
    actions.setCallDuration(0);
    telnyxActions.clearError();
  }, [actions, telnyxActions]);

  return {
    cleanupEffects,
  };
};
