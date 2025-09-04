/**
 * CALL STATE VALIDATOR
 *
 * This utility ensures proper call state transitions and prevents
 * the critical call flow synchronization issue from recurring.
 *
 * CRITICAL: Any changes to call state logic must pass these validations.
 */

export type CallState =
  | "idle"
  | "dialing"
  | "ringing"
  | "connected"
  | "voicemail"
  | "ended";

export interface CallStateTransition {
  from: CallState;
  to: CallState;
  isValid: boolean;
  reason?: string;
}

/**
 * Valid call state transitions
 * CRITICAL: These transitions define the expected call flow
 */
const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  idle: ["dialing"],
  dialing: ["ringing", "ended", "idle"], // Allow direct to idle for failures
  ringing: ["connected", "voicemail", "ended", "idle"], // Allow direct to idle for failures
  connected: ["ended", "idle"],
  voicemail: ["ended", "idle"],
  ended: ["idle", "ringing"], // Allow recovery from ended to ringing when ICE connection is established
};

/**
 * Validates if a call state transition is allowed
 */
export function validateCallStateTransition(
  fromState: CallState,
  toState: CallState
): CallStateTransition {
  const isValid = VALID_TRANSITIONS[fromState]?.includes(toState) ?? false;

  return {
    from: fromState,
    to: toState,
    isValid,
    reason: isValid
      ? undefined
      : `Invalid transition from ${fromState} to ${toState}`,
  };
}

/**
 * CRITICAL CALL FLOW VALIDATIONS
 * These functions ensure the call flow synchronization works correctly
 */

/**
 * Validates that the call flow follows the expected sequence
 * This is the core validation that prevents the ringing sync issue
 */
export function validateCallFlowSequence(
  telnyxState: string,
  currentUIState: CallState
): {
  shouldTransition: boolean;
  targetState: CallState | null;
  reason: string;
} {
  // CRITICAL: These mappings ensure UI state syncs with Telnyx state
  const telnyxToUIStateMap: Record<string, CallState> = {
    new: "dialing",
    requesting: "dialing",
    trying: "dialing",
    early: "ringing",
    ringing: "ringing",
    answered: "connected",
    connected: "connected",
    hangup: "ended",
    destroy: "ended",
    failed: "ended",
  };

  const expectedUIState = telnyxToUIStateMap[telnyxState];

  if (!expectedUIState) {
    return {
      shouldTransition: false,
      targetState: null,
      reason: `Unknown Telnyx state: ${telnyxState}`,
    };
  }

  // CRITICAL: Always transition if UI state doesn't match expected state
  // This prevents the sync issue where UI gets stuck in wrong state
  if (currentUIState !== expectedUIState) {
    return {
      shouldTransition: true,
      targetState: expectedUIState,
      reason: `UI state (${currentUIState}) doesn't match expected state (${expectedUIState}) for Telnyx state (${telnyxState})`,
    };
  }

  return {
    shouldTransition: false,
    targetState: null,
    reason: `UI state already correct for Telnyx state ${telnyxState}`,
  };
}

/**
 * Validates that ringing state is properly triggered
 * This specifically prevents the "ringing only after redirect" issue
 */
export function validateRingingStateTransition(
  telnyxState: string,
  currentUIState: CallState,
  callDuration: number
): { shouldRing: boolean; reason: string } {
  // CRITICAL: Ringing should start when Telnyx reaches "early" or "ringing" state
  const ringingStates = ["early", "ringing"];

  if (ringingStates.includes(telnyxState)) {
    if (currentUIState !== "ringing" && currentUIState !== "connected") {
      return {
        shouldRing: true,
        reason: `Telnyx state is ${telnyxState}, should transition to ringing`,
      };
    }
  }

  // CRITICAL: Don't ring if call has been active too long (prevents stuck ringing)
  if (callDuration > 60 && currentUIState === "ringing") {
    return {
      shouldRing: false,
      reason: `Call has been ringing for ${callDuration}s, may be stuck`,
    };
  }

  return {
    shouldRing: false,
    reason: `No ringing transition needed`,
  };
}

/**
 * Validates call state monitoring logic
 * This ensures the monitoring doesn't get stuck in wrong states
 */
export function validateCallStateMonitoring(
  telnyxState: string,
  currentUIState: CallState,
  isConnecting: boolean,
  isCallActive: boolean
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  // CRITICAL: Check for state inconsistencies
  if (telnyxState === "early" && currentUIState === "idle") {
    issues.push(
      "CRITICAL: Telnyx is ringing but UI is idle - this causes the sync issue!"
    );
  }

  if (telnyxState === "trying" && currentUIState === "idle") {
    issues.push(
      "CRITICAL: Telnyx is trying to connect but UI is idle - this causes the sync issue!"
    );
  }

  if (isConnecting && currentUIState === "idle") {
    issues.push(
      "CRITICAL: isConnecting is true but UI state is idle - inconsistent state"
    );
  }

  if (isCallActive && !["connected", "voicemail"].includes(currentUIState)) {
    issues.push(
      "CRITICAL: isCallActive is true but UI state is not connected/voicemail"
    );
  }

  // CRITICAL: Check for stuck states
  if (currentUIState === "dialing" && telnyxState === "early") {
    issues.push(
      "CRITICAL: UI stuck in dialing while Telnyx is ringing - this is the main sync issue!"
    );
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Development-time call flow monitor
 * Logs warnings when call flow issues are detected
 */
export function monitorCallFlow(
  telnyxState: string,
  currentUIState: CallState,
  isConnecting: boolean,
  isCallActive: boolean,
  callDuration: number
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const monitoring = validateCallStateMonitoring(
    telnyxState,
    currentUIState,
    isConnecting,
    isCallActive
  );

  if (!monitoring.isValid) {
    console.warn("🚨 CALL FLOW ISSUE DETECTED:", {
      telnyxState,
      currentUIState,
      isConnecting,
      isCallActive,
      callDuration,
      issues: monitoring.issues,
    });
  }

  // Check for ringing state issues specifically
  const ringingValidation = validateRingingStateTransition(
    telnyxState,
    currentUIState,
    callDuration
  );
  if (ringingValidation.shouldRing) {
    console.warn("🔔 RINGING STATE ISSUE:", ringingValidation.reason);
  }
}

/**
 * Call flow health check
 * Returns overall health of the call flow system
 */
export function getCallFlowHealth(
  telnyxState: string,
  currentUIState: CallState,
  isConnecting: boolean,
  isCallActive: boolean,
  callDuration: number
): {
  isHealthy: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check state consistency
  const monitoring = validateCallStateMonitoring(
    telnyxState,
    currentUIState,
    isConnecting,
    isCallActive
  );
  if (!monitoring.isValid) {
    issues.push(...monitoring.issues);
    score -= monitoring.issues.length * 20;
  }

  // Check for stuck states
  if (callDuration > 30 && currentUIState === "dialing") {
    issues.push("Call stuck in dialing state for too long");
    recommendations.push(
      "Check if Telnyx state is properly transitioning to early/ringing"
    );
    score -= 30;
  }

  if (callDuration > 60 && currentUIState === "ringing") {
    issues.push("Call stuck in ringing state for too long");
    recommendations.push(
      "Check if call is actually connecting or if there's a network issue"
    );
    score -= 20;
  }

  // Check for the specific sync issue
  if (telnyxState === "early" && currentUIState === "dialing") {
    issues.push(
      "CRITICAL: The main sync issue detected - Telnyx is ringing but UI shows dialing"
    );
    recommendations.push(
      "Fix the call state monitoring logic to properly transition to ringing"
    );
    score -= 50;
  }

  return {
    isHealthy: score >= 80,
    score: Math.max(0, score),
    issues,
    recommendations,
  };
}
