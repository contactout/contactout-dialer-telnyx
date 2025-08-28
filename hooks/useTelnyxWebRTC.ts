import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { DatabaseService } from "@/lib/database";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

type CallState =
  | "idle"
  | "connecting"
  | "trying"
  | "ringing"
  | "answered"
  | "active"
  | "ended"
  | "failed"
  | "error";

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
  status: "completed" | "failed" | "missed" | "incoming";
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
    status: "completed" | "failed" | "missed" | "incoming",
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
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
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
          idle: ["connecting", "trying"],
          connecting: ["trying", "ringing", "failed", "error", "idle"],
          trying: ["ringing", "answered", "failed", "error", "idle"],
          ringing: ["answered", "failed", "error", "idle"],
          answered: ["active", "ended", "failed", "error"],
          active: ["ended", "failed", "error"],
          ended: ["idle"],
          failed: ["idle"],
          error: ["idle"],
        };

        if (!validTransitions[currentState].includes(newState)) {
          return currentState;
        }

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
        case "connecting":
        case "trying":
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
        case "answered":
        case "active":
          setIsConnecting(false);
          setIsCallActive(true);
          setCurrentCall(call);
          setError(null);
          if (!callStartTime) {
            setCallStartTime(Date.now());
          }
          break;
        case "ended":
        case "failed":
        case "error":
          setIsConnecting(false);
          setIsCallActive(false);
          setError(null);
          break;
      }
    },
    [cleanupAll]
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
      status: "completed" | "failed",
      duration?: number,
      phoneNumberOverride?: string
    ) => {
      if (!userId) return;

      // Get the actual phone number that was dialed
      // The call object might not have phoneNumber, so we need to get it from the current call state
      // Also allow phoneNumberOverride for cases where we know the number but the call object doesn't have it
      const phoneNumber =
        phoneNumberOverride ||
        call.phoneNumber ||
        currentCall?.phoneNumber ||
        config.phoneNumber;

      // Debug: Log the call object and tracking data
      console.log("Tracking call to database:", {
        call,
        status,
        duration,
        userId,
        phoneNumber,
        callControlId: call.call_control_id,
        callId: call.id,
        currentCall: currentCall,
        callProperties: {
          hasPhoneNumber: !!call.phoneNumber,
          hasCallControlId: !!call.call_control_id,
          hasCallId: !!call.id,
          callState: call.state,
          callKeys: Object.keys(call || {}),
        },
      });

      console.log("Calling DatabaseService.trackCall with:", {
        user_id: userId,
        phone_number: phoneNumber,
        status,
        call_control_id: call.id || call.call_control_id,
        duration,
        callId: call.id,
        callState: call.state,
      });

      DatabaseService.trackCall({
        user_id: userId,
        phone_number: phoneNumber,
        status,
        call_control_id: call.id || call.call_control_id, // Use call.id as fallback
        duration,
      })
        .then(() => {
          console.log("DatabaseService.trackCall completed successfully");
        })
        .catch((error) => {
          console.error("DatabaseService.trackCall failed:", error);
        });
    },
    [userId, config.phoneNumber, currentCall]
  );

  const notifyCallStatus = useCallback(
    (
      status: "completed" | "failed" | "missed" | "incoming",
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
        console.error("Telnyx client error:", error);

        const errorMessages: Record<string, string> = {
          AUTH_FAILED: "Authentication failed - please check credentials",
          NETWORK_ERROR: "Network error - please check connection",
          INVALID_CONFIG: "Invalid configuration - please check settings",
        };

        const errorMessage =
          errorMessages[error.code] ||
          `Telnyx error: ${error.message || "Unknown error"}`;

        setError(errorMessage);
        setIsConnected(false);
        setIsInitializing(false);
        initializingRef.current = false;
        // Don't set initializedRef to true on error - let it retry
        // initializedRef.current = true;
        // Don't set configRef.current on error - let it retry with fresh config

        if (error.code === "AUTH_FAILED" || error.code === "INVALID_CONFIG") {
          transitionCallState("idle");
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
        console.log("📞 Telnyx client call event received:", call.state);

        // PRIMARY CALL HANDLER - This is now our main way to handle calls
        if (call && call.state) {
          const currentTime = Date.now();
          // Use currentCall's start time if available, otherwise estimate
          const callDuration =
            currentCall && callStartTime
              ? (currentTime - callStartTime) / 1000
              : 0;

          console.log("📞 Primary call handler:", {
            callId: call.id,
            state: call.state,
            callDuration: callDuration.toFixed(1) + "s",
            callState,
            isConnecting,
          });

          // IMMEDIATE FAILURE DETECTION - Handle quick failures first
          if (
            (call.state === "hangup" || call.state === "destroy") &&
            (callState === "connecting" || callState === "trying")
          ) {
            if (callDuration < 2) {
              console.log("🚨 IMMEDIATE FAILURE DETECTED via primary handler");
              setError(
                "Call failed - Invalid phone number or number not reachable"
              );
              transitionCallState("idle", call);

              // Log call to Supabase
              trackCall(
                call,
                "failed",
                Math.floor(callDuration),
                call.phoneNumber || config.phoneNumber
              );

              // Notify status
              notifyCallStatus(
                "failed",
                call.phoneNumber || config.phoneNumber
              );

              // Clean up call state immediately
              setCurrentCall(null);
              setCallControlId(null);
              setCallStartTime(null);
              return;
            }
          }

          // Handle all state transitions
          switch (call.state) {
            case "requesting":
              if (callState !== "connecting") {
                console.log("📞 Call requesting -> connecting");
                transitionCallState("connecting", call);
              }
              break;

            case "trying":
              if (callState !== "trying") {
                console.log("📞 Call trying -> trying");
                transitionCallState("trying", call);
              }
              break;

            case "ringing":
              if (callState !== "ringing") {
                console.log("📞 Call ringing -> ringing");
                transitionCallState("ringing", call);
              }
              break;

            case "answered":
              if (callState !== "answered") {
                console.log("📞 Call answered -> answered");
                transitionCallState("answered", call);
              }
              break;

            case "hangup":
              console.log("📞 Call hangup detected via primary handler");
              handleCallHangup(call, call.phoneNumber || config.phoneNumber);
              break;

            case "destroy":
              console.log("📞 Call destroy detected via primary handler");
              handleCallDestroy(call, call.phoneNumber || config.phoneNumber);
              break;

            case "failed":
              console.log("📞 Call failed detected via primary handler");
              handleCallFailed(call, call.phoneNumber || config.phoneNumber);
              break;
          }
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
    ]
  );

  // ============================================================================
  // CALL HANDLING
  // ============================================================================

  // COMPLETELY REWRITTEN CALL HANDLING SYSTEM - NO MORE call.on() RELIANCE
  const handleCallCreation = useCallback(
    (call: any, phoneNumber: string) => {
      console.log(
        "🔄 HANDLE CALL CREATION - Starting new call handling system"
      );

      // Set initial call state
      setCurrentCall(call);
      setCallControlId(call.id);
      setCallStartTime(Date.now());

      // Store call start time locally to avoid state update delays
      const localCallStartTime = Date.now();

      // Transition to connecting state
      transitionCallState("connecting", call);

      // AGGRESSIVE CALL STATE MONITORING - Check every 100ms for immediate response
      const callStateMonitor = setInterval(() => {
        if (!call || !call.state) {
          console.log("❌ Call or call.state is null, stopping monitor");
          clearInterval(callStateMonitor);
          return;
        }

        const currentTime = Date.now();
        const callDuration = (currentTime - localCallStartTime) / 1000;

        console.log(
          `🔍 Call State Monitor: ${call.state} (${callDuration.toFixed(1)}s)`
        );

        // IMMEDIATE FAILURE DETECTION - If call fails within 2 seconds
        if (
          callDuration < 2 &&
          (call.state === "hangup" || call.state === "destroy")
        ) {
          console.log(
            "🚨 IMMEDIATE FAILURE DETECTED - Call failed in <2 seconds"
          );

          // Set error FIRST before any state changes
          console.log("🚨 Setting error state for failed call");
          const errorMessage =
            "Call failed - Invalid phone number or number not reachable";
          console.log("🚨 Error message:", errorMessage);
          setError(errorMessage);

          // Verify error was set
          setTimeout(() => {
            console.log("🔍 Error state verification - should be set now");
          }, 50);

          // Log call to Supabase BEFORE state transition
          console.log("📊 Logging failed call to Supabase");
          trackCall(call, "failed", Math.floor(callDuration), phoneNumber);

          // Notify status
          notifyCallStatus("failed", phoneNumber);

          // DON'T transition to idle immediately for call failures
          // Keep the call state as "failed" so the error popup can show
          console.log(
            "🚨 Keeping call state as failed for error popup display"
          );
          // transitionCallState("idle", call); // REMOVED - let error popup handle this

          // Clean up call objects but keep state for UI
          setCurrentCall(null);
          setCallControlId(null);
          setCallStartTime(null);

          // Stop monitoring
          clearInterval(callStateMonitor);

          // Force error to persist for a moment
          setTimeout(() => {
            console.log("🔍 Error state should now be visible to user");
          }, 100);

          return;
        }

        // Handle state transitions
        switch (call.state) {
          case "requesting":
            if (callState !== "connecting") {
              console.log("📞 Call requesting -> connecting");
              transitionCallState("connecting", call);
            }
            break;

          case "trying":
            if (callState !== "trying") {
              console.log("📞 Call trying -> trying");
              transitionCallState("trying", call);
            }
            break;

          case "ringing":
            if (callState !== "ringing") {
              console.log("📞 Call ringing -> ringing");
              transitionCallState("ringing", call);
            }
            break;

          case "answered":
            if (callState !== "answered") {
              console.log("📞 Call answered -> answered");
              transitionCallState("answered", call);
            }
            break;

          case "hangup":
            console.log("📞 Call hangup detected");
            handleCallHangup(call, phoneNumber);
            clearInterval(callStateMonitor);
            break;

          case "destroy":
            console.log("📞 Call destroy detected");
            handleCallDestroy(call, phoneNumber);
            clearInterval(callStateMonitor);
            break;

          case "failed":
            console.log("📞 Call failed detected");
            handleCallFailed(call, phoneNumber);
            clearInterval(callStateMonitor);
            break;
        }

        // TIMEOUT HANDLING - If call is stuck in connecting/trying for too long
        if (
          (call.state === "connecting" || call.state === "trying") &&
          callDuration > 8
        ) {
          console.log("⏰ Call timeout - transitioning to failed");
          handleCallFailed(call, phoneNumber);
          clearInterval(callStateMonitor);
        }
      }, 100); // Check every 100ms for immediate response

      // Store the interval for cleanup
      timeoutManager.current.addInterval(callStateMonitor);
    },
    [callState, callStartTime, transitionCallState, trackCall, notifyCallStatus]
  );

  // REWRITTEN CALL EVENT HANDLERS
  const handleCallHangup = useCallback(
    (call: any, phoneNumber: string) => {
      console.log("📞 HANDLE CALL HANGUP - Processing call hangup");

      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;
      console.log(`📞 Call hangup - Duration: ${duration}s`);

      // Determine call status based on duration
      let callStatus: "completed" | "failed" = "completed";
      let errorMessage = "";

      if (duration < 2) {
        // Very short call - likely invalid number
        callStatus = "failed";
        errorMessage =
          "Call failed - Invalid phone number or number not reachable";
        console.log("🚨 Quick failure detected in hangup handler");
      } else if (duration < 5) {
        // Short call - might be temporary unavailability
        callStatus = "failed";
        errorMessage = "Call failed - Number temporarily unavailable";
        console.log("⚠️ Short call failure detected in hangup handler");
      }

      // Set error if call failed (but only if not already set)
      if (callStatus === "failed") {
        // Only set error if it's not already set to avoid duplicates
        if (!error || !error.includes("failed")) {
          setError(errorMessage);
          console.log("🚨 Setting error in hangup handler:", errorMessage);
        } else {
          console.log(
            "🚨 Error already set, skipping duplicate in hangup handler"
          );
        }
        // Keep call state as failed for error popup
        console.log("🚨 Keeping call state as failed in hangup handler");
        // transitionCallState("idle", call); // REMOVED - let error popup handle this
      } else {
        transitionCallState("idle", call);
      }

      // Track call in Supabase
      trackCall(call, callStatus, duration, phoneNumber);

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
    },
    [callStartTime, transitionCallState, trackCall, notifyCallStatus]
  );

  const handleCallDestroy = useCallback(
    (call: any, phoneNumber: string) => {
      console.log("📞 HANDLE CALL DESTROY - Processing call destroy");

      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;
      console.log(`📞 Call destroy - Duration: ${duration}s`);

      // Determine call status based on duration
      let callStatus: "completed" | "failed" = "completed";
      let errorMessage = "";

      if (duration < 2) {
        // Very short call - likely invalid number
        callStatus = "failed";
        errorMessage =
          "Call failed - Invalid phone number or number not reachable";
        console.log("🚨 Quick failure detected in destroy handler");
      } else if (duration < 5) {
        // Short call - might be temporary unavailability
        callStatus = "failed";
        errorMessage = "Call failed - Number temporarily unavailable";
        console.log("⚠️ Short call failure detected in destroy handler");
      }

      // Set error if call failed (but only if not already set)
      if (callStatus === "failed") {
        // Only set error if it's not already set to avoid duplicates
        if (!error || !error.includes("failed")) {
          setError(errorMessage);
          console.log("🚨 Setting error in destroy handler:", errorMessage);
        } else {
          console.log(
            "🚨 Error already set, skipping duplicate in destroy handler"
          );
        }
        // Keep call state as failed for error popup
        console.log("🚨 Keeping call state as failed in destroy handler");
        // transitionCallState("idle", call); // REMOVED - let error popup handle this
      } else {
        transitionCallState("idle", call);
      }

      // Track call in Supabase
      trackCall(call, callStatus, duration, phoneNumber);

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
    },
    [callStartTime, transitionCallState, trackCall, notifyCallStatus]
  );

  const handleCallFailed = useCallback(
    (call: any, phoneNumber: string) => {
      console.log("📞 HANDLE CALL FAILED - Processing call failure");

      const duration = callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;
      console.log(`📞 Call failed - Duration: ${duration}s`);

      // Set error message (but only if not already set)
      if (!error || !error.includes("failed")) {
        setError("Call failed - Unable to connect");
        console.log(
          "🚨 Setting error in failed handler: Call failed - Unable to connect"
        );
      } else {
        console.log(
          "🚨 Error already set, skipping duplicate in failed handler"
        );
      }

      // Keep current state for error popup display
      console.log("🚨 Keeping current call state for error popup display");
      // transitionCallState("failed", call); // REMOVED - let error popup handle this

      // Track call in Supabase
      trackCall(call, "failed", duration, phoneNumber);

      // Notify status
      notifyCallStatus("failed", phoneNumber);

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
    },
    [callStartTime, transitionCallState, trackCall, notifyCallStatus]
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

        // Try different call creation methods
        let call: any;
        if (typeof client.newCall === "function") {
          call = client.newCall({
            destinationNumber: phoneNumber,
            callerNumber: config.phoneNumber,
          });
        } else if (typeof (client as any).call === "function") {
          call = (client as any).call({
            destinationNumber: phoneNumber,
            callerNumber: config.phoneNumber,
          });
        } else if (typeof (client as any).createCall === "function") {
          call = (client as any).createCall({
            destinationNumber: phoneNumber,
            callerNumber: config.phoneNumber,
          });
        } else {
          throw new Error(
            "Telnyx client does not have newCall, call, or createCall method"
          );
        }

        if (!call || typeof call !== "object") {
          transitionCallState("failed", call);
          // Only set error if not already set to avoid duplicates
          if (!error || !error.includes("failed")) {
            setError("Call failed");
            console.log(
              "🚨 Setting error in makeCall (no call object): Call failed"
            );
          }
          notifyCallStatus("failed", phoneNumber);
          return;
        }

        if (call.error || call.state === "failed" || call.state === "error") {
          transitionCallState("failed", call);
          // Only set error if not already set to avoid duplicates
          if (!error || !error.includes("failed")) {
            setError("Call failed");
            console.log(
              "🚨 Setting error in makeCall (call error state): Call failed"
            );
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
          console.log(
            "🚨 Setting error in makeCall catch block:",
            `Call failed: ${err.message || "Unknown error"}`
          );
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
    if (currentCall && typeof currentCall.hangup === "function") {
      try {
        currentCall.hangup();
      } catch (error) {
        console.error("Error hanging up call:", error);
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
        currentCall.hangup();
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
    transitionCallState("idle");
  }, [transitionCallState]);

  // Function to properly handle call failure completion (called by error popup)
  const completeCallFailure = useCallback(() => {
    console.log("🚨 Completing call failure - transitioning to idle");
    transitionCallState("idle");
    setCurrentCall(null);
    setCallControlId(null);
    setCallStartTime(null);
  }, [transitionCallState]);

  const debugAudioSetup = useCallback(() => {
    // Debug function - can be expanded as needed
  }, []);

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
  };
};
