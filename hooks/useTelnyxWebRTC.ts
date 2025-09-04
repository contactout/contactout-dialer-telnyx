import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { DatabaseService } from "@/lib/database";
import {
  validateCallFlowSequence,
  validateRingingStateTransition,
  monitorCallFlow,
  getCallFlowHealth,
  type CallState,
} from "@/lib/callStateValidator";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

// CallState type is now imported from callStateValidator

type NetworkQuality = "excellent" | "good" | "fair" | "poor";

interface TelnyxConfig {
  apiKey: string;
  sipUsername: string;
  sipPassword: string;
  phoneNumber: string;
}

interface CallRecord {
  user_id: string;
  phone_number: string;
  status: "completed" | "failed" | "missed" | "incoming" | "voicemail";
  call_control_id?: string;
  duration?: number;
}

interface UseTelnyxWebRTCReturn {
  // Connection state
  isConnected: boolean;
  isInitializing: boolean;
  isReconnecting: boolean;

  // Call state
  isCallActive: boolean;
  isConnecting: boolean;
  callState: CallState;
  callControlId: string | null;

  // Audio state
  hasMicrophoneAccess: boolean;
  networkQuality: NetworkQuality;

  // Error handling
  error: string | null;

  // Actions
  makeCall: (phoneNumber: string) => Promise<void>;
  hangupCall: () => void;
  sendDTMF: (digit: string) => void;
  retryCall: (phoneNumber: string, maxRetries?: number) => Promise<void>;

  // Utility functions
  clearError: () => void;
  forceResetCallState: () => void;
  completeCallFailure: () => void;
  debugAudioSetup: () => void;
  triggerReconnection: () => void;
  retryMicrophoneAccess: () => void;

  // Call flow monitoring
  getCallFlowHealth: () => {
    isHealthy: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

// ============================================================================
// UTILITY CLASSES
// ============================================================================

class TimeoutManager {
  private timeouts = new Set<NodeJS.Timeout>();
  private intervals = new Set<NodeJS.Timeout>();

  addTimeout(timeout: NodeJS.Timeout) {
    this.timeouts.add(timeout);
    return timeout;
  }

  addInterval(interval: NodeJS.Timeout) {
    this.intervals.add(interval);
    return interval;
  }

  clearAll() {
    this.timeouts.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timeouts.clear();
    this.intervals.clear();
  }

  clearTimeout(timeout: NodeJS.Timeout) {
    if (this.timeouts.has(timeout)) {
      clearTimeout(timeout);
      this.timeouts.delete(timeout);
    }
  }

  clearInterval(interval: NodeJS.Timeout) {
    if (this.intervals.has(interval)) {
      clearInterval(interval);
      this.intervals.delete(interval);
    }
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export const useTelnyxWebRTC = (
  config: TelnyxConfig,
  userId?: string,
  onCallStatusChange?: (
    status: "completed" | "failed" | "missed" | "incoming" | "voicemail",
    phoneNumber?: string,
    duration?: number
  ) => void
) => {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Client state
  const [client, setClient] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Call state
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callControlId, setCallControlId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [currentDialedNumber, setCurrentDialedNumber] = useState<string | null>(
    null
  );

  // Use ref to track current call state to avoid stale closures in monitor
  const currentCallStateRef = useRef<CallState>(callState);

  // Audio state
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>("good");

  // Error and reconnection state
  const [error, setError] = useState<string | null>(null);
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);

  // ============================================================================
  // REFS
  // ============================================================================

  const timeoutManager = useRef(new TimeoutManager());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialization tracking
  const initializingRef = useRef<boolean>(false);
  const initializedRef = useRef<boolean>(false);
  const configRef = useRef<TelnyxConfig | null>(null);

  // ============================================================================
  // CONFIG MANAGEMENT
  // ============================================================================

  // Don't set configRef.current here - it should only be set after successful initialization
  // This prevents the config change detection from thinking nothing has changed

  // ============================================================================
  // CLEANUP FUNCTIONS
  // ============================================================================

  const cleanupAll = useCallback(() => {
    timeoutManager.current.clearAll();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Only reset initializing flag, not the initialized flag
    // This prevents re-initialization loops
    initializingRef.current = false;
    // Don't reset initializedRef.current here
    // Don't reset configRef.current here
  }, []);

  // ============================================================================
  // CALL STATE MANAGEMENT
  // ============================================================================

  const transitionCallState = useCallback(
    (newState: CallState, call?: any) => {
      setCallState((currentState) => {
        if (currentState === newState) {
          return currentState;
        }

        // Validate state transitions
        const validTransitions: Record<CallState, CallState[]> = {
          idle: ["dialing"],
          dialing: ["ringing", "ended"],
          ringing: ["connected", "voicemail", "ended"],
          connected: ["ended"],
          voicemail: ["ended"],
          ended: ["idle", "ringing"], // Allow recovery from ended to ringing when ICE connection is established
        };

        if (!validTransitions[currentState].includes(newState)) {
          return currentState;
        }

        // Update the ref to track current state
        currentCallStateRef.current = newState;
        return newState;
      });

      // Update related states based on call state
      switch (newState) {
        case "idle":
          setIsConnecting(false);
          setIsCallActive(false);
          setCurrentCall(null);
          setCallControlId(null);
          setCallStartTime(null);
          setError(null);
          cleanupAll();
          break;
        case "dialing":
          setIsConnecting(true);
          setIsCallActive(false);
          setCurrentCall(call);
          setError(null);
          break;
        case "ringing":
          setIsConnecting(true);
          setIsCallActive(false);
          setCurrentCall(call);
          setError(null);
          break;
        case "connected":
          setIsConnecting(false);
          setIsCallActive(true);
          setCurrentCall(call);
          setError(null);
          if (!callStartTime) {
            setCallStartTime(Date.now());
          }
          break;
        case "voicemail":
          setIsConnecting(false);
          setIsCallActive(true); // Treat voicemail as active call for DTMF support
          setCurrentCall(call);
          setError(null);
          if (!callStartTime) {
            setCallStartTime(Date.now());
          }
          break;
        case "ended":
          setIsConnecting(false);
          setIsCallActive(false);
          setError(null);
          // Automatically transition to idle after a short delay to show the ended state
          setTimeout(() => {
            transitionCallState("idle");
          }, 1000); // 1 second delay to show the ended state
          break;
      }
    },
    [cleanupAll, callStartTime]
  );

  // ============================================================================
  // VOICE MAIL DETECTION LOGIC
  // ============================================================================

  /**
   * Detect if a call has been forwarded to voice mail
   * Based on Telnyx call patterns and duration analysis
   * FIXED: Made voice mail detection more conservative to avoid false positives
   */
  const detectVoiceMail = useCallback(
    (call: any, callDuration: number): boolean => {
      try {
        // Voice mail detection heuristics with confidence scoring
        let confidence = 0;
        const patterns = [];

        // CRITICAL FIX: Only use reliable indicators, not just timing
        // Pattern 1: Check for specific Telnyx voice mail indicators (most reliable)
        if (call.state === "answered" && call.voice_mail_detected) {
          confidence += 8;
          patterns.push("Telnyx voice mail flag");
        }

        // Pattern 2: Check for machine answer patterns (reliable)
        if (call.state === "answered" && call.machine_answer) {
          confidence += 6;
          patterns.push("Machine answer detected");
        }

        // Pattern 3: Check for specific voice mail headers or metadata
        if (
          call.state === "answered" &&
          call.headers &&
          (call.headers["X-Voice-Mail"] === "true" ||
            call.headers["X-Answer-Type"] === "machine")
        ) {
          confidence += 7;
          patterns.push("Voice mail header detected");
        }

        // Pattern 4: Multiple call legs (less reliable, but can indicate forwarding)
        if (call.state === "answered" && call.legs && call.legs.length > 1) {
          confidence += 2;
          patterns.push("Multiple call legs");
        }

        // Pattern 5: Very short call duration combined with specific patterns
        // Only consider this if we have other indicators
        if (call.state === "answered" && callDuration < 2 && confidence > 0) {
          confidence += 1;
          patterns.push("Very short duration with other indicators");
        }

        // CRITICAL FIX: Require much higher confidence to avoid false positives
        // Normal calls should NOT be classified as voice mail
        const isVoiceMail = confidence >= 6; // Increased threshold from 3 to 6

        // Log voice mail detection in development for debugging
        if (process.env.NODE_ENV === "development" && confidence > 0) {
          console.log(
            `🎙️ Voice mail detection: confidence=${confidence}, patterns=[${patterns.join(
              ", "
            )}], result=${isVoiceMail}`
          );
        }

        return isVoiceMail;
      } catch (error) {
        console.error("Error detecting voice mail:", error);
        return false;
      }
    },
    []
  );

  // ============================================================================
  // RECONNECTION LOGIC
  // ============================================================================

  const attemptReconnection = useCallback(async () => {
    if (reconnectionAttempts >= 5) {
      setError(
        "Failed to reconnect after multiple attempts. Please refresh the page or check your credentials."
      );
      setIsReconnecting(false);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectionAttempts), 30000);

    const reconnectTimeout = setTimeout(async () => {
      if (client && typeof client.connect === "function") {
        try {
          await client.connect();
          setReconnectionAttempts(0);
          setIsReconnecting(false);
          setError(null);
        } catch (error) {
          console.error("Reconnection failed:", error);
          setReconnectionAttempts((prev) => prev + 1);
          setError(
            `Reconnection failed (attempt ${
              reconnectionAttempts + 1
            }/5). Retrying...`
          );
          // Continue attempting reconnection
          attemptReconnection();
        }
      } else {
        console.error("Client not available for reconnection");
        setError(
          "Client not available for reconnection. Please refresh the page."
        );
        setIsReconnecting(false);
      }
    }, delay);

    timeoutManager.current.addTimeout(reconnectTimeout);
  }, [client, reconnectionAttempts]);

  // Manual reconnection trigger
  const triggerReconnection = useCallback(async () => {
    if (isReconnecting || isInitializing) {
      return;
    }

    setReconnectionAttempts(0);
    setError("Attempting to reconnect...");
    setIsReconnecting(true);

    try {
      if (client && typeof client.connect === "function") {
        await client.connect();
        setIsReconnecting(false);
        setError(null);
      } else {
        throw new Error("Client not available");
      }
    } catch (error) {
      console.error("Manual reconnection failed:", error);
      setError(
        "Manual reconnection failed. Please check your credentials and network."
      );
      setIsReconnecting(false);
    }
  }, [client, isReconnecting, isInitializing]);

  // Retry microphone access
  const retryMicrophoneAccess = useCallback(async () => {
    if (hasMicrophoneAccess) {
      return;
    }

    setError("Attempting to access microphone...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setHasMicrophoneAccess(true);
      setError(null);
    } catch (micError: unknown) {
      console.error("Failed to get microphone access on retry:", micError);

      let errorMessage = "Failed to access microphone";
      if (micError instanceof Error) {
        if (micError.name === "NotAllowedError") {
          errorMessage =
            "Microphone access denied. Please allow microphone permissions and try again.";
        } else if (micError.name === "NotFoundError") {
          errorMessage =
            "No microphone found. Please connect a microphone and try again.";
        } else if (micError.name === "NotReadableError") {
          errorMessage =
            "Microphone is in use by another application. Please close other apps using the microphone.";
        } else if (micError.name === "OverconstrainedError") {
          errorMessage =
            "Microphone doesn't meet requirements. Please try a different microphone.";
        }
      }

      setError(errorMessage);
      setHasMicrophoneAccess(false);
    }
  }, [hasMicrophoneAccess]);

  // ============================================================================
  // DATABASE TRACKING
  // ============================================================================

  const trackCall = useCallback(
    (
      call: any,
      status: "completed" | "failed" | "voicemail",
      duration?: number,
      phoneNumberOverride?: string
    ) => {
      if (!userId) return;

      // Get the actual phone number that was dialed
      // Use the stored dialed number to ensure we track the correct number
      // Priority: phoneNumberOverride > call.dialedPhoneNumber > currentDialedNumber > call.phoneNumber > currentCall?.phoneNumber
      const phoneNumber =
        phoneNumberOverride ||
        call?.dialedPhoneNumber ||
        currentDialedNumber ||
        call.phoneNumber ||
        currentCall?.phoneNumber;

      // Validate that we have a phone number
      if (!phoneNumber) {
        // No phone number available for call tracking
        return;
      }

      // Call tracking to database
      DatabaseService.trackCall({
        user_id: userId,
        phone_number: phoneNumber,
        status,
        call_control_id: call.id || call.call_control_id, // Use call.id as fallback
        duration,
      }).catch((error) => {
        // DatabaseService.trackCall failed
      });
    },
    [userId, currentDialedNumber, currentCall]
  );

  const notifyCallStatus = useCallback(
    (
      status: "completed" | "failed" | "missed" | "incoming" | "voicemail",
      phoneNumber?: string,
      duration?: number
    ) => {
      if (onCallStatusChange) {
        onCallStatusChange(status, phoneNumber, duration);
      }
    },
    [onCallStatusChange]
  );

  // ============================================================================
  // EVENT HANDLER SETUP
  // ============================================================================

  const setupEventHandlers = useCallback(
    (telnyxClient: any) => {
      // Connection events
      telnyxClient.on("telnyx.ready", () => {
        setIsConnected(true);
        setError(null);
        setIsInitializing(false);
        initializingRef.current = false;
        initializedRef.current = true;
        // Only set configRef after successful connection
        configRef.current = config;
      });

      telnyxClient.on("telnyx.error", (error: any) => {
        console.error("❌ Telnyx client error:", error);

        // Enhanced error handling with Telnyx best practices
        const errorMessages: Record<string, string> = {
          AUTH_FAILED: "Authentication failed - please check credentials",
          NETWORK_ERROR: "Network error - please check connection",
          INVALID_CONFIG: "Invalid configuration - please check settings",
          ICE_FAILED: "Connection failed - please check network",
          MEDIA_ERROR: "Audio setup failed - please check microphone",
          TIMEOUT: "Connection timeout - please try again",
        };

        const errorMessage =
          errorMessages[error.code] ||
          `Telnyx error: ${error.message || "Unknown error"}`;

        // Only set error if it's different from current error to prevent loops
        setError((prevError) => {
          if (prevError !== errorMessage) {
            return errorMessage;
          }
          return prevError;
        });

        // Handle different error types appropriately
        if (error.code === "AUTH_FAILED" || error.code === "INVALID_CONFIG") {
          setIsConnected(false);
          setIsInitializing(false);
          initializingRef.current = false;
          transitionCallState("idle");
        } else if (
          error.code === "ICE_FAILED" ||
          error.code === "NETWORK_ERROR"
        ) {
          // Network errors should trigger reconnection
          setIsConnected(false);
          if (!isReconnecting) {
            setIsReconnecting(true);
            attemptReconnection();
          }
        } else if (error.code === "MEDIA_ERROR") {
          // Media errors should prompt user to check microphone
          setHasMicrophoneAccess(false);
        }
      });

      telnyxClient.on("telnyx.invalid", (error: any) => {
        console.error("Telnyx invalid call error:", error);
        setError(
          `Invalid call: ${
            error.message || "The phone number is invalid or cannot be reached"
          }`
        );
        setIsConnected(false);
        setIsInitializing(false);
        initializingRef.current = false;
        // Don't set initializedRef to true on error - let it retry
        // initializedRef.current = true;
        // Don't set configRef.current on error - let it retry with fresh config
      });

      telnyxClient.on("telnyx.close", () => {
        setIsConnected(false);
        setError("Connection closed");
        transitionCallState("idle");
      });

      // Call events - PRIMARY CALL HANDLER (replaces call.on() events)
      telnyxClient.on("call", (call: any) => {
        // Telnyx client call event received

        // PRIMARY CALL HANDLER - This is now our main way to handle calls
        if (call && call.state) {
          const currentTime = Date.now();
          // Use currentCall's start time if available, otherwise estimate
          const callDuration =
            currentCall && callStartTime
              ? (currentTime - callStartTime) / 1000
              : 0;

          // Primary call handler

          // IMMEDIATE FAILURE DETECTION - Only for actual failures, not normal call endings
          if (call.state === "failed" && callState === "dialing") {
            if (callDuration < 3) {
              // Immediate failure detected
              // Set error and immediately transition to idle
              setError((prevError) => {
                const failureMessage =
                  "Call failed - Invalid phone number or number not reachable";
                return prevError !== failureMessage
                  ? failureMessage
                  : prevError;
              });

              // Log call to database with failure status
              trackCall(
                call,
                "failed",
                Math.floor(callDuration),
                currentDialedNumber || undefined
              );

              // Notify status
              notifyCallStatus("failed", currentDialedNumber || undefined);

              // Clean up call state immediately
              setCurrentCall(null);
              setCallControlId(null);
              setCallStartTime(null);
              setCurrentDialedNumber(null);

              transitionCallState("idle", call);
              return;
            }
          }

          // State transitions are now handled in the call monitoring interval
          // This event handler is only for initial call creation
        }
      });

      // Network events
      telnyxClient.on("connection.lost", () => {
        setIsConnected(false);
        setError("Connection lost - attempting to reconnect...");
        setIsReconnecting(true);
        attemptReconnection();
      });

      telnyxClient.on("connection.restored", () => {
        setIsConnected(true);
        setIsReconnecting(false);
        setReconnectionAttempts(0);
        setError(null);
        setNetworkQuality("good");
      });

      telnyxClient.on("connection.failed", () => {
        setIsReconnecting(false);
        setError(
          "Failed to reconnect - please check your connection and try again"
        );

        const resetTimeout = setTimeout(() => {
          setReconnectionAttempts(0);
        }, 30000);

        timeoutManager.current.addTimeout(resetTimeout);
      });

      // Network quality monitoring
      telnyxClient.on("network.quality", (quality: any) => {
        if (quality && quality.score) {
          const score = quality.score;
          let newQuality: NetworkQuality;

          if (score >= 0.8) newQuality = "excellent";
          else if (score >= 0.6) newQuality = "good";
          else if (score >= 0.4) newQuality = "fair";
          else newQuality = "poor";

          setNetworkQuality(newQuality);

          if (newQuality === "poor" || newQuality === "fair") {
            if (isCallActive || isConnecting) {
              setError(
                `Poor network detected (${newQuality}) - audio quality may be reduced`
              );
            }
          } else if (newQuality === "excellent" || newQuality === "good") {
            if (error && error.includes("network")) {
              setError(null);
            }
          }
        }
      });
    },
    [
      config,
      transitionCallState,
      trackCall,
      notifyCallStatus,
      attemptReconnection,
      callStartTime,
      callState,
      isConnecting,
      detectVoiceMail,
      currentCall,
      currentDialedNumber,
      error,
      isCallActive,
      isReconnecting,
    ]
  );

  // ============================================================================
  // CALL HANDLING
  // ============================================================================

  // COMPLETELY REWRITTEN CALL HANDLING SYSTEM - NO MORE call.on() RELIANCE
  const handleCallCreation = useCallback(
    (call: any, phoneNumber: string) => {
      // Set initial call state
      setCurrentCall(call);
      setCallControlId(call.id);
      setCallStartTime(Date.now());
      setCurrentDialedNumber(phoneNumber);

      // Store the phone number in the call object to prevent race conditions
      if (call) {
        call.dialedPhoneNumber = phoneNumber;
      }

      // Store call start time locally to avoid state update delays
      const localCallStartTime = Date.now();

      // DON'T transition to dialing state here - let the monitor handle it based on actual Telnyx call states

      // Start monitoring immediately - no delay needed since we're not setting UI state here
      // AGGRESSIVE CALL STATE MONITORING - Check every 100ms for immediate response
      const callStateMonitor = setInterval(() => {
        if (!call || !call.state) {
          clearInterval(callStateMonitor);
          return;
        }

        const currentTime = Date.now();
        const callDuration = (currentTime - localCallStartTime) / 1000;

        // Read current UI state from ref to avoid stale closure
        const currentUIState = currentCallStateRef.current;

        // CRITICAL: Use validator to ensure proper call flow synchronization
        const flowValidation = validateCallFlowSequence(
          call.state,
          currentUIState
        );

        if (flowValidation.shouldTransition && flowValidation.targetState) {
          console.log(
            `🔄 Call flow transition: ${currentUIState} → ${flowValidation.targetState} (${flowValidation.reason})`
          );
          transitionCallState(flowValidation.targetState, call);
          return;
        }

        // CRITICAL: Monitor call flow for issues in development
        monitorCallFlow(
          call.state,
          currentUIState,
          isConnecting,
          isCallActive,
          callDuration
        );

        // IMMEDIATE FAILURE DETECTION - Only for actual failures, not normal call endings
        // hangup and destroy are normal end states, not failures
        if (
          callDuration < 3 &&
          call.state === "failed" && // Only treat "failed" state as actual failure
          currentUIState === "dialing" // Only treat as failure if we're still in dialing state
        ) {
          // Set error FIRST before any state changes
          const errorMessage =
            "Call failed - Invalid phone number or number not reachable";
          setError(errorMessage);

          // Log call to Supabase BEFORE state transition
          trackCall(call, "failed", Math.floor(callDuration), phoneNumber);

          // Notify status
          notifyCallStatus("failed", phoneNumber);

          // DON'T transition to idle immediately for call failures
          // Keep the call state as "failed" so the error popup can show
          // transitionCallState("idle", call); // REMOVED - let error popup handle this

          // Clean up call objects but keep state for UI
          setCurrentCall(null);
          setCallControlId(null);
          setCallStartTime(null);
          setCurrentDialedNumber(null);

          // Stop monitoring
          clearInterval(callStateMonitor);

          return;
        }

        // Handle state transitions in the monitoring interval
        // This is where we actually detect state changes
        switch (call.state) {
          case "new":
            // Call just created - transition to dialing
            if (currentUIState !== "dialing") {
              transitionCallState("dialing", call);
            }
            break;

          case "requesting":
            // Call is being requested - ensure we're in dialing state
            if (currentUIState !== "dialing") {
              transitionCallState("dialing", call);
            }
            break;

          case "trying":
            // Call is trying to connect - ensure we're in dialing state
            if (currentUIState !== "dialing") {
              transitionCallState("dialing", call);
            }
            break;

          case "ringing":
            if (currentUIState !== "ringing") {
              transitionCallState("ringing", call);
            }
            break;

          case "early":
            // Always transition to ringing when we reach early state (ICE connection established)
            if (
              currentUIState !== "ringing" &&
              currentUIState !== "connected"
            ) {
              transitionCallState("ringing", call);
            }
            break;

          case "answered":
            if (
              currentUIState !== "connected" &&
              currentUIState !== "voicemail"
            ) {
              const callDuration = callStartTime
                ? Math.floor((Date.now() - callStartTime) / 1000)
                : 0;

              if (detectVoiceMail(call, callDuration)) {
                transitionCallState("voicemail", call);
              } else {
                transitionCallState("connected", call);
              }
            }
            break;

          case "connected":
            if (currentUIState !== "connected") {
              transitionCallState("connected", call);
            }
            break;

          case "hangup":
            // Transition to ended state before handling hangup
            if (currentUIState !== "ended") {
              transitionCallState("ended", call);
            }
            // hangup is a normal end state, not a failure
            handleCallHangup(call, phoneNumber);
            // Stop monitoring after handling hangup
            clearInterval(callStateMonitor);
            return;

          case "destroy":
            // Transition to ended state before handling destroy
            if (currentUIState !== "ended") {
              transitionCallState("ended", call);
            }
            // destroy is a normal cleanup state, not a failure
            handleCallDestroy(call, phoneNumber);
            // Stop monitoring after handling destroy
            clearInterval(callStateMonitor);
            return;

          case "failed":
            handleCallFailed(call, phoneNumber);
            break;
        }

        // TIMEOUT HANDLING - If call is stuck in connecting/trying for too long
        // Increased timeout for international calls which can take longer to establish ICE connection
        // Only timeout if we're still in early connection stages
        if (
          (call.state === "connecting" || call.state === "trying") &&
          callDuration > 45 && // Increased from 15s to 45s for international calls
          call.state !== "early" // Don't timeout if we've reached "early" state (ICE connection established)
        ) {
          // Log the call to Supabase before handling failure
          trackCall(call, "failed", Math.floor(callDuration), phoneNumber);
          notifyCallStatus("failed", phoneNumber);
          handleCallFailed(call, phoneNumber);
          clearInterval(callStateMonitor);
        }

        // CLEANUP MONITORING - Only stop monitoring after we've handled the state transition
        // Don't stop monitoring for hangup/destroy - let the switch statement handle them first
        if (call.state === "connected" || call.state === "failed") {
          clearInterval(callStateMonitor);
          return; // Exit the monitor loop
        }
      }, 100); // Check every 100ms for immediate response

      // Store the interval for cleanup
      timeoutManager.current.addInterval(callStateMonitor);
    },
    [
      callState,
      callStartTime,
      transitionCallState,
      trackCall,
      notifyCallStatus,
      detectVoiceMail,
      isCallActive,
      isConnecting,
    ]
  );

  // REWRITTEN CALL EVENT HANDLERS
  const handleCallHangup = useCallback(
    (call: any, phoneNumber: string) => {
      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;

      // Determine call status based on duration, call state, and hangup reason
      let callStatus: "completed" | "failed" | "voicemail" = "completed";
      let errorMessage = "";
      let isUserHangup = false;

      // Check if this was a voice mail call
      if (callState === "voicemail") {
        callStatus = "voicemail";

        // Determine if user hung up or system ended the call
        if (duration < 15) {
          // Short voice mail call - likely user hung up
          errorMessage = "Call forwarded to voice mail - User hung up";
          isUserHangup = true;
        } else {
          // Longer voice mail call - likely completed message
          errorMessage = "Call forwarded to voice mail - Message left";
        }
      } else {
        // Analyze hangup reason and duration to determine the cause
        const hangupReason = call?.reason || "";
        const hangupError = call?.error || "";

        // Detect call rejection scenarios
        if (callState === "ringing" && duration < 10) {
          // Call was rejected while ringing (went from early to hangup quickly)
          callStatus = "failed";
          errorMessage = "Call rejected - The other party declined the call";
        } else if (duration < 2) {
          // Very short call - likely invalid number or immediate rejection
          callStatus = "failed";
          if (hangupReason.includes("busy") || hangupError.includes("busy")) {
            errorMessage = "Call failed - Number is busy";
          } else if (
            hangupReason.includes("no-answer") ||
            hangupError.includes("no-answer")
          ) {
            errorMessage = "Call failed - No answer";
          } else {
            errorMessage =
              "Call failed - Invalid phone number or number not reachable";
          }
        } else if (duration < 5) {
          // Short call - might be temporary unavailability or rejection
          callStatus = "failed";
          if (hangupReason.includes("busy") || hangupError.includes("busy")) {
            errorMessage = "Call failed - Number is busy";
          } else if (
            hangupReason.includes("no-answer") ||
            hangupError.includes("no-answer")
          ) {
            errorMessage = "Call failed - No answer";
          } else {
            errorMessage = "Call failed - Number temporarily unavailable";
          }
        } else if (
          hangupReason.includes("busy") ||
          hangupError.includes("busy")
        ) {
          // Call was busy
          callStatus = "failed";
          errorMessage = "Call failed - Number is busy";
        } else if (
          hangupReason.includes("no-answer") ||
          hangupError.includes("no-answer")
        ) {
          // No answer
          callStatus = "failed";
          errorMessage = "Call failed - No answer";
        }
        // If none of the above conditions match, it's considered a completed call
      }

      // Set error if call failed or voice mail (but only if not already set)
      if (callStatus === "failed" || callStatus === "voicemail") {
        // Only set error if it's not already set to avoid duplicates
        if (
          !error ||
          !error.includes("failed") ||
          !error.includes("voice mail")
        ) {
          setError(errorMessage);
        }

        if (callStatus === "voicemail") {
          // For voice mail, show notification briefly then transition to idle
          setTimeout(() => {
            transitionCallState("idle", call);
          }, 3000); // Show notification for 3 seconds
        } else {
          // Keep call state as failed for error popup
          // transitionCallState("idle", call); // REMOVED - let error popup handle this
        }
      } else {
        transitionCallState("idle", call);
      }

      // Track call in Supabase
      trackCall(call, callStatus, duration, phoneNumber);

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // Properly terminate the call if it's still active
      if (call && typeof call.hangup === "function") {
        try {
          call.hangup();
        } catch (error: any) {
          // Filter out common hangup errors that don't indicate real problems
          if (
            error?.code === -32002 &&
            error?.message === "CALL DOES NOT EXIST"
          ) {
            // This is expected when the call has already ended
          } else {
            console.error("Error hanging up call:", error);
          }
        }
      }

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCurrentDialedNumber(null);
    },
    [
      callStartTime,
      callState,
      error,
      transitionCallState,
      trackCall,
      notifyCallStatus,
    ]
  );

  const handleCallDestroy = useCallback(
    (call: any, phoneNumber: string) => {
      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;

      // Determine call status based on duration and call state
      let callStatus: "completed" | "failed" = "completed";
      let errorMessage = "";

      // CRITICAL FIX: Only mark as failed if we have clear indicators of failure
      // Don't assume short calls are failures - they might be successful but brief
      if (duration < 1) {
        // Extremely short call - likely invalid number or immediate failure
        callStatus = "failed";
        errorMessage =
          "Call failed - Invalid phone number or number not reachable";
      } else if (duration < 3 && currentCallStateRef.current === "dialing") {
        // Very short call that never progressed past dialing - likely failure
        callStatus = "failed";
        errorMessage = "Call failed - Number not reachable";
      } else if (duration < 3 && currentCallStateRef.current === "ringing") {
        // Very short call that never progressed past ringing - likely failure
        callStatus = "failed";
        errorMessage = "Call failed - No answer";
      }
      // For all other cases, including short successful calls, mark as completed

      // Set error if call failed (but only if not already set)
      if (callStatus === "failed") {
        // Only set error if it's not already set to avoid duplicates
        if (!error || !error.includes("failed")) {
          setError(errorMessage);
        }
        // Keep call state as failed for error popup
        // transitionCallState("idle", call); // REMOVED - let error popup handle this
      } else {
        transitionCallState("idle", call);
      }

      // Track call in Supabase
      trackCall(call, callStatus, duration, phoneNumber);

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // Properly terminate the call if it's still active
      if (call && typeof call.hangup === "function") {
        try {
          call.hangup();
        } catch (error: any) {
          // Filter out common hangup errors that don't indicate real problems
          if (
            error?.code === -32002 &&
            error?.message === "CALL DOES NOT EXIST"
          ) {
            // This is expected when the call has already ended
          } else {
            console.error("Error hanging up call:", error);
          }
        }
      }

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCurrentDialedNumber(null);
    },
    [callStartTime, transitionCallState, trackCall, notifyCallStatus]
  );

  const handleCallFailed = useCallback(
    (call: any, phoneNumber: string) => {
      try {
        const duration = callStartTime
          ? Math.floor((Date.now() - callStartTime) / 1000)
          : 0;

        // Set error message (but only if not already set)
        if (!error || !error.includes("failed")) {
          setError("Call failed - Unable to connect");
        }

        // Keep current state for error popup display
        // transitionCallState("failed", call); // REMOVED - let error popup handle this

        // Track call in Supabase with error handling
        try {
          trackCall(call, "failed", duration, phoneNumber);
        } catch (trackError) {
          console.error("Error tracking failed call:", trackError);
        }

        // Notify status with error handling
        try {
          notifyCallStatus("failed", phoneNumber);
        } catch (notifyError) {
          console.error("Error notifying call status:", notifyError);
        }

        // Clean up call state
        setCurrentCall(null);
        setCallControlId(null);
        setCallStartTime(null);
        setCurrentDialedNumber(null);
      } catch (error) {
        console.error("🚨 Error in handleCallFailed:", error);
        // Fallback cleanup
        setCurrentCall(null);
        setCallControlId(null);
        setCallStartTime(null);
        setCurrentDialedNumber(null);
        setError("Call failed - Unable to connect");
      }
    },
    [callStartTime, transitionCallState, trackCall, notifyCallStatus, error]
  );

  // ============================================================================
  // CLIENT INITIALIZATION
  // ============================================================================

  useEffect(() => {
    // Don't run if user is not authenticated yet
    if (!userId) {
      return;
    }

    // Additional check: if we already have a client and user ID is the same, don't initialize
    if (client && userId === previousUserIdRef.current) {
      return;
    }

    // Update the previous user ID reference
    previousUserIdRef.current = userId;

    // Check if config has actually changed
    const configChanged =
      !configRef.current ||
      configRef.current.apiKey !== config.apiKey ||
      configRef.current.sipUsername !== config.sipUsername ||
      configRef.current.sipPassword !== config.sipPassword ||
      configRef.current.phoneNumber !== config.phoneNumber;

    // Prevent infinite re-rendering by adding a check for rapid config changes
    if (configRef.current && !configChanged) {
      return;
    }

    // Additional check: if we're already initializing, don't start another initialization
    if (initializingRef.current) {
      return;
    }

    if (
      !config.apiKey ||
      !config.sipUsername ||
      !config.sipPassword ||
      !config.phoneNumber
    ) {
      setError("Missing Telnyx credentials");
      return;
    }

    // Additional check: if any config value is empty string, don't initialize
    if (
      config.apiKey.trim() === "" ||
      config.sipUsername.trim() === "" ||
      config.sipPassword.trim() === "" ||
      config.phoneNumber.trim() === ""
    ) {
      setError("Missing Telnyx credentials");
      return;
    }

    // Prevent duplicate initialization
    if (client) {
      return;
    }

    // Additional check: if we already have a client, don't initialize again
    if (client || initializedRef.current) {
      return;
    }

    initializingRef.current = true;
    setIsInitializing(true);

    const initializeClient = async () => {
      try {
        if (typeof TelnyxRTC === "undefined") {
          console.error("❌ Telnyx WebRTC SDK not loaded");
          setError("Telnyx WebRTC SDK not loaded");
          return;
        }

        // Get microphone access - but don't block Telnyx initialization
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
            video: false,
          });
          localStreamRef.current = stream;
          setHasMicrophoneAccess(true);
        } catch (micError: unknown) {
          console.error("Failed to get microphone access:", micError);

          // Provide specific error messages based on the error type
          let errorMessage = "Microphone access required for calls";
          if (micError instanceof Error) {
            if (micError.name === "NotAllowedError") {
              errorMessage =
                "Microphone access denied. Please allow microphone permissions and refresh the page.";
            } else if (micError.name === "NotFoundError") {
              errorMessage =
                "No microphone found. Please connect a microphone and refresh the page.";
            } else if (micError.name === "NotReadableError") {
              errorMessage =
                "Microphone is in use by another application. Please close other apps using the microphone.";
            } else if (micError.name === "OverconstrainedError") {
              errorMessage =
                "Microphone doesn't meet requirements. Please try a different microphone.";
            }
          }

          // Set error for microphone issues but continue with Telnyx
          setError(errorMessage);
          setHasMicrophoneAccess(false);
          // Don't return here - continue with Telnyx initialization
        }

        // Create Telnyx client with best practices configuration
        const telnyxClient = new TelnyxRTC({
          login_token: config.apiKey,
          login: config.sipUsername,
          password: config.sipPassword,
        });

        // Setup all event handlers
        setupEventHandlers(telnyxClient);

        setClient(telnyxClient);

        // Connect to Telnyx
        await telnyxClient.connect();
        setIsInitializing(false);
        initializingRef.current = false;
        // Don't set initializedRef here - let the telnyx.ready event handle it
        // Don't set configRef here - let the telnyx.ready event handle it
      } catch (err) {
        console.error("Failed to initialize Telnyx client:", err);

        // Provide more specific error messages
        let errorMessage = "Failed to initialize WebRTC client";
        if (err instanceof Error) {
          if (err.message.includes("login_token")) {
            errorMessage =
              "Invalid API key - please check your Telnyx credentials";
          } else if (err.message.includes("login")) {
            errorMessage =
              "Invalid SIP username - please check your Telnyx credentials";
          } else if (err.message.includes("password")) {
            errorMessage =
              "Invalid SIP password - please check your Telnyx credentials";
          } else if (err.message.includes("network")) {
            errorMessage =
              "Network error - please check your internet connection";
          } else {
            errorMessage = `Telnyx initialization failed: ${err.message}`;
          }
        }

        setError(errorMessage);
        setIsInitializing(false);
        initializingRef.current = false;
      }
    };

    initializeClient();

    return () => {
      cleanupAll();
    };
  }, [
    userId,
    config.apiKey,
    config.sipUsername,
    config.sipPassword,
    config.phoneNumber,
  ]);

  // ============================================================================
  // CALL MANAGEMENT FUNCTIONS
  // ============================================================================

  const makeCall = useCallback(
    async (phoneNumber: string) => {
      // Convert phone number to E.164 format for Telnyx
      const { toE164 } = await import("@/lib/phoneNumberUtils");
      const e164Number = toE164(phoneNumber);

      // Enhanced validation - check both connection and microphone
      if (!client) {
        setError("Telnyx client not initialized");
        return;
      }

      if (!isConnected) {
        setError(
          "Not connected to Telnyx. Please wait for connection or check credentials."
        );
        // Attempt to reconnect if not connected
        if (!isReconnecting && !isInitializing) {
          setIsReconnecting(true);
          attemptReconnection();
        }
        return;
      }

      if (!hasMicrophoneAccess) {
        setError(
          "Microphone access required for calls. Please allow microphone permissions."
        );
        return;
      }

      // Phone number validation
      const cleanedNumber = phoneNumber.replace(/[^\d+]/g, "");
      if (cleanedNumber.length < 7) {
        setError("Phone number must be at least 7 digits");
        return;
      }

      try {
        setIsConnecting(true);
        setError(null);
        // Set initial dialing state immediately when call is initiated
        transitionCallState("dialing");

        // Create call using Telnyx best practices
        let call: any;

        // Use the standard newCall method with proper parameters
        if (typeof client.newCall === "function") {
          call = client.newCall({
            destinationNumber: e164Number,
            callerNumber: config.phoneNumber,
            // Add call options for better quality
            audio: true,
            video: false,
            // Set proper headers for better routing
            headers: {
              "X-Call-Type": "outbound",
              "X-User-Agent": "ContactOut-Dialer/1.0",
            },
          });
        } else if (typeof (client as any).call === "function") {
          call = (client as any).call({
            destinationNumber: e164Number,
            callerNumber: config.phoneNumber,
            audio: true,
            video: false,
          });
        } else if (typeof (client as any).createCall === "function") {
          call = (client as any).createCall({
            destinationNumber: e164Number,
            callerNumber: config.phoneNumber,
            audio: true,
            video: false,
          });
        } else {
          throw new Error(
            "Telnyx client does not have newCall, call, or createCall method"
          );
        }

        if (!call || typeof call !== "object") {
          transitionCallState("ended", call);
          // Only set error if not already set to avoid duplicates
          if (!error || !error.includes("failed")) {
            setError("Call failed");
          }
          notifyCallStatus("failed", phoneNumber);
          return;
        }

        if (call.error || call.state === "failed" || call.state === "error") {
          transitionCallState("ended", call);
          // Only set error if not already set to avoid duplicates
          if (!error || !error.includes("failed")) {
            setError("Call failed");
          }
          notifyCallStatus("failed", phoneNumber);
          return;
        }

        handleCallCreation(call, phoneNumber);
      } catch (err: any) {
        console.error("Call creation failed:", err);
        // Only set error if not already set to avoid duplicates
        if (!error || !error.includes("failed")) {
          setError(`Call failed: ${err.message || "Unknown error"}`);
        }
        setIsConnecting(false);
        notifyCallStatus("failed", phoneNumber);
      }
    },
    [
      client,
      isConnected,
      hasMicrophoneAccess,
      config.phoneNumber,
      callState,
      transitionCallState,
      trackCall,
      notifyCallStatus,
      handleCallCreation,
    ]
  );

  const hangupCall = useCallback(() => {
    // Check if call is already in a terminal state
    if (
      currentCall &&
      currentCall.state &&
      (currentCall.state === "hangup" ||
        currentCall.state === "destroy" ||
        currentCall.state === "idle")
    ) {
      transitionCallState("idle");
      return;
    }

    if (currentCall && typeof currentCall.hangup === "function") {
      try {
        currentCall.hangup();
      } catch (error: any) {
        // Filter out common hangup errors that don't indicate real problems
        if (
          error?.code === -32002 &&
          error?.message === "CALL DOES NOT EXIST"
        ) {
          // This is expected when the call has already ended
        } else {
          console.error("Error hanging up call:", error);
        }
      }
    }
    transitionCallState("idle");
  }, [currentCall, transitionCallState]);

  const sendDTMF = useCallback(
    (digit: string) => {
      if (currentCall && typeof currentCall.sendDTMF === "function") {
        try {
          currentCall.sendDTMF(digit);
        } catch (error) {
          console.error("Error sending DTMF:", error);
        }
      } else {
        console.warn(
          "Cannot send DTMF - no active call or method not available"
        );
      }
    },
    [currentCall]
  );

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const retryCall = useCallback(
    async (phoneNumber: string, maxRetries: number = 3) => {
      if (currentCall && typeof currentCall.hangup === "function") {
        try {
          currentCall.hangup();
        } catch (error: any) {
          // Filter out common hangup errors that don't indicate real problems
          if (
            error?.code === -32002 &&
            error?.message === "CALL DOES NOT EXIST"
          ) {
            // Call already ended during retry - proceeding
          } else {
            console.error("Error hanging up call during retry:", error);
          }
        }
      }

      transitionCallState("idle");
      setError(null);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        await makeCall(phoneNumber);
      } catch (error) {
        setError("Retry failed - please try again");
      }
    },
    [currentCall, transitionCallState, makeCall]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const forceResetCallState = useCallback(() => {
    // Properly transition to ended state first, then to idle
    if (callState === "ringing" || callState === "dialing") {
      transitionCallState("ended");
      // Let the ended state handler transition to idle
    } else {
      transitionCallState("idle");
    }
  }, [transitionCallState, callState]);

  // Function to properly handle call failure completion (called by error popup)
  const completeCallFailure = useCallback(() => {
    try {
      transitionCallState("idle");
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCurrentDialedNumber(null);
    } catch (error) {
      // Error in completeCallFailure
      // Fallback cleanup
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCurrentDialedNumber(null);
    }
  }, [transitionCallState]);

  const debugAudioSetup = useCallback(() => {
    // Debug function - can be expanded as needed
  }, []);

  // Call flow health check
  const getCallFlowHealthCheck = useCallback(() => {
    const callDuration = callStartTime
      ? (Date.now() - callStartTime) / 1000
      : 0;

    return getCallFlowHealth(
      currentCall?.state || "idle",
      callState,
      isConnecting,
      isCallActive,
      callDuration
    );
  }, [
    currentCall?.state,
    callState,
    isConnecting,
    isCallActive,
    callStartTime,
  ]);

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  // ============================================================================
  // RETURN OBJECT
  // ============================================================================

  return {
    // Connection state
    isConnected,
    isInitializing,
    isReconnecting,

    // Call state
    isCallActive,
    isConnecting,
    callState,
    callControlId,

    // Audio state
    hasMicrophoneAccess,
    networkQuality,

    // Error handling
    error,

    // Actions
    makeCall,
    hangupCall,
    sendDTMF,
    retryCall,

    // Utility functions
    clearError,
    forceResetCallState,
    completeCallFailure,
    debugAudioSetup,
    triggerReconnection,
    retryMicrophoneAccess,

    // Call flow monitoring
    getCallFlowHealth: getCallFlowHealthCheck,
  };
};
