import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { DatabaseService } from "@/lib/database";
import {
  validateCallFlowSequence,
  validateRingingStateTransition,
  validateCallStateTransition,
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

  // Enhanced fields for native Telnyx events
  hangup_cause?: string;
  hangup_source?: string;
  call_start_time?: Date;
  call_connected_time?: Date;
  call_end_time?: Date;
  telnyx_call_id?: string;
  telnyx_leg_id?: string;
  call_quality_score?: number;
  network_quality?: string;
  voice_mail_detected?: boolean;
  machine_answer?: boolean;
  amd_result?: string;
  sip_response_code?: number;
  sip_response_text?: string;
  error_code?: string;
  error_message?: string;
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
  currentCall: any;

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
  const [callConnectedTime, setCallConnectedTime] = useState<number | null>(
    null
  );
  const [currentDialedNumber, setCurrentDialedNumber] = useState<string | null>(
    null
  );
  const [wasCallConnected, setWasCallConnected] = useState<boolean>(false);
  const [trackedCallIds, setTrackedCallIds] = useState<Set<string>>(new Set());

  // Use ref to track current call state to avoid stale closures in monitor
  const currentCallStateRef = useRef<CallState>(callState);

  // Logging guard ref to prevent infinite logging
  const transitionLoggingGuardRef = useRef<{
    lastTransitionTime: number;
    lastState: string | null;
    logCount: number;
  }>({
    lastTransitionTime: 0,
    lastState: null,
    logCount: 0,
  });

  // CRITICAL FIX: Keep ref in sync with callState
  useEffect(() => {
    currentCallStateRef.current = callState;
  }, [callState]);

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

        // FIXED: Add robust logging guard to prevent infinite logging
        const now = Date.now();

        const guard = transitionLoggingGuardRef.current;
        const timeSinceLastTransition = now - guard.lastTransitionTime;
        const isSameState = guard.lastState === `${currentState}→${newState}`;

        // Only log if enough time has passed and it's not the same transition
        if (timeSinceLastTransition > 150 && !isSameState) {
          console.log(`🔄 State transition: ${currentState} → ${newState}`, {
            isConnecting,
            isCallActive,
            hasCurrentCall: !!currentCall,
            callControlId,
          });
          guard.lastTransitionTime = now;
          guard.lastState = `${currentState}→${newState}`;
          guard.logCount++;
        }

        // Validate state transitions
        const validTransitions: Record<CallState, CallState[]> = {
          idle: ["dialing"],
          dialing: ["ringing", "ended"],
          ringing: ["connected", "voicemail", "ended"],
          connected: ["ended"],
          voicemail: ["ended"],
          ended: ["idle"], // FIXED: Only allow ended → idle to prevent state loops
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
          setCallConnectedTime(null);
          setWasCallConnected(false);
          setTrackedCallIds(new Set()); // Clear tracked call IDs
          // FIXED: Don't clear error when transitioning to idle if it's a call failure
          // This allows error popups to be displayed for rejected calls
          setError((currentError) => {
            // Only clear error if it's not a call failure message
            if (
              currentError &&
              (currentError.includes("rejected") ||
                currentError.includes("failed") ||
                currentError.includes("busy") ||
                currentError.includes("no-answer") ||
                currentError.includes("voice mail"))
            ) {
              // Keep the error for the popup to display
              return currentError;
            }
            // Clear other types of errors
            return null;
          });
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
          console.log("📞 Call connected - setting up audio and call state");
          setIsConnecting(false);
          setIsCallActive(true);
          setCurrentCall(call);
          setError(null);
          setWasCallConnected(true);
          if (!callStartTime) {
            setCallStartTime(Date.now());
          }
          // Track when call actually became connected for accurate duration calculation
          setCallConnectedTime(Date.now());

          // CRITICAL: Ensure audio context is active for bidirectional communication
          try {
            if (localStreamRef.current) {
              console.log("🎤 Local audio stream is available for call");
            } else {
              console.warn(
                "⚠️ No local audio stream available - this may cause audio issues"
              );
            }
          } catch (error) {
            console.error("❌ Error checking audio stream:", error);
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
          // Track when call actually became connected (voicemail is also a connection)
          setCallConnectedTime(Date.now());
          break;
        case "ended":
          setIsConnecting(false);
          setIsCallActive(false);
          setCurrentCall(null);
          setCallControlId(null);
          setCallStartTime(null);
          setCallConnectedTime(null);
          setCurrentDialedNumber(null);
          setError(null);
          // Don't reset wasCallConnected here - we need it for cleanup logic
          // FIXED: Prevent recursive calls by using direct state update instead of transitionCallState
          const transitionTimeout = setTimeout(() => {
            try {
              // Direct state update to avoid recursive transitionCallState calls
              setCallState("idle");
              currentCallStateRef.current = "idle";
              console.log("🔄 Direct transition: ended → idle (timeout)");
            } catch (error) {
              console.error("Error transitioning from ended to idle:", error);
              // Force reset if transition fails
              setCallState("idle");
              setIsConnecting(false);
              setIsCallActive(false);
              setCurrentCall(null);
              setCallControlId(null);
              setCallStartTime(null);
              setCallConnectedTime(null);
              setCurrentDialedNumber(null);
              setError(null);
              currentCallStateRef.current = "idle";
            }
          }, 1000); // 1 second delay to show the ended state

          // Store timeout reference for cleanup
          timeoutManager.current.addTimeout(transitionTimeout);
          break;
      }
    },
    [
      cleanupAll,
      callStartTime,
      callControlId,
      currentCall,
      isCallActive,
      isConnecting,
    ]
  );

  // ============================================================================
  // MICROPHONE ACCESS MANAGEMENT
  // ============================================================================

  const initializeMicrophoneAccess = useCallback(async () => {
    try {
      console.log("🎤 Initializing microphone access...");

      // Check if we already have a valid stream
      if (localStreamRef.current && localStreamRef.current.active) {
        console.log("🎤 Microphone stream already active");
        setHasMicrophoneAccess(true);
        return true;
      }

      // Request microphone access with optimal settings
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

      // Store the stream and update state
      localStreamRef.current = stream;
      setHasMicrophoneAccess(true);
      console.log("✅ Microphone access granted");

      // Monitor stream state changes
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          console.warn("⚠️ Microphone track ended");
          setHasMicrophoneAccess(false);
        });

        track.addEventListener("mute", () => {
          console.warn("⚠️ Microphone track muted");
        });

        track.addEventListener("unmute", () => {
          console.log("✅ Microphone track unmuted");
        });
      });

      return true;
    } catch (micError: unknown) {
      console.error("❌ Failed to get microphone access:", micError);

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
      return false;
    }
  }, []);

  const retryMicrophoneAccess = useCallback(async () => {
    console.log("🔄 Retrying microphone access...");

    // Clean up existing stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Try to get new access
    return await initializeMicrophoneAccess();
  }, [initializeMicrophoneAccess]);

  const validateMicrophoneAccess = useCallback(() => {
    if (!localStreamRef.current) {
      console.warn("⚠️ No microphone stream available");
      setHasMicrophoneAccess(false);
      return false;
    }

    if (!localStreamRef.current.active) {
      console.warn("⚠️ Microphone stream is not active");
      setHasMicrophoneAccess(false);
      return false;
    }

    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("⚠️ No audio tracks in microphone stream");
      setHasMicrophoneAccess(false);
      return false;
    }

    const activeTracks = audioTracks.filter(
      (track) => track.readyState === "live"
    );
    if (activeTracks.length === 0) {
      console.warn("⚠️ No active audio tracks");
      setHasMicrophoneAccess(false);
      return false;
    }

    console.log("✅ Microphone access validated");
    setHasMicrophoneAccess(true);
    return true;
  }, []);

  // ============================================================================
  // VOICE MAIL DETECTION LOGIC
  // ============================================================================

  /**
   * Detect if a call has been forwarded to voice mail
   * SIMPLIFIED: Uses only reliable detection methods
   * 1. Telnyx native detection (primary)
   * 2. Voice mail headers (reliable fallback)
   */
  const detectVoiceMail = useCallback((call: any): boolean => {
    try {
      // Primary: Telnyx native detection (95%+ accuracy)
      if (
        call.voice_mail_detected ||
        call.machine_answer ||
        call.amd_result === "machine"
      ) {
        console.log("🎙️ Voice mail detected via Telnyx native detection");
        return true;
      }

      // Fallback: Voice mail headers (90%+ accuracy, reliable)
      if (
        call.state === "answered" &&
        call.headers &&
        (call.headers["X-Voice-Mail"] === "true" ||
          call.headers["X-Answer-Type"] === "machine")
      ) {
        console.log("🎙️ Voice mail detected via headers (fallback)");
        return true;
      }

      // No voice mail detected
      return false;
    } catch (error) {
      console.error("Error in voice mail detection:", error);
      return false;
    }
  }, []);

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

  // ============================================================================
  // DATABASE TRACKING
  // ============================================================================

  const trackCall = useCallback(
    (
      call: any,
      status: "completed" | "failed" | "voicemail",
      duration?: number,
      phoneNumberOverride?: string,
      nativeEventData?: {
        hangup_cause?: string;
        hangup_source?: string;
        telnyx_call_id?: string;
        telnyx_leg_id?: string;
        voice_mail_detected?: boolean;
        machine_answer?: boolean;
        amd_result?: string;
        sip_response_code?: number;
        sip_response_text?: string;
        error_code?: string;
        error_message?: string;
      }
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

      // Create a unique identifier for this call attempt
      const callId =
        call.id || call.call_control_id || `${phoneNumber}-${callStartTime}`;

      // Check if this call has already been tracked
      if (trackedCallIds.has(callId)) {
        console.log(
          `📞 Call ${callId} already tracked, skipping duplicate entry`
        );
        return;
      }

      // Mark this call as tracked
      setTrackedCallIds((prev) => new Set(prev).add(callId));

      console.log(
        `📞 Tracking call ${callId} with status: ${status}`,
        nativeEventData
      );

      // Call tracking to database with native event data
      DatabaseService.trackCall({
        user_id: userId,
        phone_number: phoneNumber,
        status,
        call_control_id: callId,
        duration,
        call_start_time: callStartTime ? new Date(callStartTime) : undefined,
        call_connected_time: callConnectedTime
          ? new Date(callConnectedTime)
          : undefined,
        call_end_time: new Date(),
        network_quality: networkQuality,
        ...nativeEventData,
      }).catch((error) => {
        console.error("DatabaseService.trackCall failed:", error);
        // Remove from tracked set if database call failed
        setTrackedCallIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(callId);
          return newSet;
        });
      });
    },
    [
      userId,
      currentDialedNumber,
      currentCall,
      callStartTime,
      callConnectedTime,
      networkQuality,
      trackedCallIds,
    ]
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

      // CRITICAL FIX: Add proper telnyx.notification handler (Telnyx's actual event system)
      telnyxClient.on("telnyx.notification", (notification: any) => {
        // FIXED: Add logging guard to prevent infinite console output
        const now = Date.now();
        const lastNotificationTime = telnyxClient.lastNotificationTime || 0;
        const timeSinceLastNotification = now - lastNotificationTime;

        if (timeSinceLastNotification > 200) {
          // 200ms minimum between notification logs
          console.log(
            `📞 Telnyx notification: ${notification.type}`,
            notification
          );
          telnyxClient.lastNotificationTime = now;
        }

        if (notification.type === "callUpdate") {
          const call = notification.call;
          // FIXED: Add logging guard for call state updates
          const lastCallStateTime = call.lastStateLogTime || 0;
          const timeSinceLastCallState = now - lastCallStateTime;

          if (timeSinceLastCallState > 300) {
            // 300ms minimum between call state logs
            console.log(
              `📞 Call state update: ${call.state} for call ${call.id}`
            );
            call.lastStateLogTime = now;
          }

          if (call && call.state) {
            const currentTime = Date.now();
            const callDuration =
              currentCall && callStartTime
                ? (currentTime - callStartTime) / 1000
                : 0;

            // Map Telnyx call states directly to UI states
            const stateMap: Record<string, CallState> = {
              new: "dialing",
              requesting: "dialing",
              trying: "dialing",
              early: "ringing",
              ringing: "ringing",
              connected: "connected",
              active: "connected",
              answered: "connected",
              hangup: "ended",
              destroy: "ended",
              failed: "ended",
            };

            const targetUIState = stateMap[call.state];

            if (
              targetUIState &&
              currentCallStateRef.current !== targetUIState
            ) {
              // FIXED: Add logging guard for state transitions
              const lastTransitionLogTime = call.lastTransitionLogTime || 0;
              const timeSinceLastTransitionLog = now - lastTransitionLogTime;

              if (timeSinceLastTransitionLog > 250) {
                // 250ms minimum between transition logs
                console.log(
                  `🔄 Notification-driven transition: ${currentCallStateRef.current} → ${targetUIState} (Telnyx: ${call.state})`
                );
                call.lastTransitionLogTime = now;
              }

              // Handle special cases
              if (call.state === "answered") {
                // Use simplified voice mail detection (Telnyx native + headers only)
                const voiceMailDetected = detectVoiceMail(call);

                if (voiceMailDetected) {
                  console.log("🎙️ Voice mail detected:", {
                    voice_mail_detected: call.voice_mail_detected,
                    machine_answer: call.machine_answer,
                    amd_result: call.amd_result,
                    headers: call.headers,
                  });
                  transitionCallState("voicemail", call);
                } else {
                  transitionCallState("connected", call);
                }
              } else if (call.state === "failed") {
                // Handle failed calls immediately
                if (
                  callDuration < 5 &&
                  currentCallStateRef.current === "dialing"
                ) {
                  setError(
                    "Call failed - Invalid phone number or number not reachable"
                  );
                  trackCall(
                    call,
                    "failed",
                    Math.floor(callDuration),
                    currentDialedNumber || undefined
                  );
                  notifyCallStatus("failed", currentDialedNumber || undefined);
                }
                transitionCallState("ended", call);
              } else if (call.state === "hangup" || call.state === "destroy") {
                // Handle call endings using native Telnyx events
                if (call.state === "hangup") {
                  const duration = callStartTime
                    ? (Date.now() - callStartTime) / 1000
                    : 0;

                  // Use native Telnyx hangup events instead of manual detection
                  const hangupCause = call.hangup_cause || call.reason;
                  const hangupSource = call.hangup_source || call.source;

                  console.log("📞 Native Telnyx hangup event:", {
                    hangup_cause: hangupCause,
                    hangup_source: hangupSource,
                    duration: duration,
                    call_state: currentCallStateRef.current,
                  });

                  // Set appropriate error message based on native Telnyx hangup cause and source
                  if (
                    hangupCause === "call_rejected" ||
                    hangupCause === "rejected"
                  ) {
                    if (hangupSource === "callee") {
                      setError(
                        "Call declined - The person you called declined the call"
                      );
                    } else {
                      setError(
                        "Call rejected - The other party declined the call"
                      );
                    }
                  } else if (
                    hangupCause === "busy" ||
                    hangupCause === "user_busy"
                  ) {
                    if (hangupSource === "callee") {
                      setError(
                        "Call failed - The person you called is currently on another call"
                      );
                    } else {
                      setError("Call failed - Number is busy");
                    }
                  } else if (
                    hangupCause === "no_answer" ||
                    hangupCause === "no-answer"
                  ) {
                    if (hangupSource === "callee") {
                      setError("Call failed - No one answered the call");
                    } else {
                      setError("Call failed - No answer");
                    }
                  } else if (hangupCause === "normal_clearing") {
                    if (hangupSource === "callee") {
                      setError("Call completed - The other party hung up");
                    } else if (hangupSource === "caller") {
                      // User hung up - no error message needed
                      setError(null);
                    } else {
                      setError("Call completed");
                    }
                  } else if (hangupCause === "unallocated_number") {
                    setError("Call failed - Invalid phone number");
                  } else if (hangupCause === "network_error") {
                    setError("Call failed - Network connection issue");
                  } else if (hangupCause === "timeout") {
                    setError("Call failed - Connection timeout");
                  } else {
                    // Fallback for unknown hangup causes
                    if (
                      currentCallStateRef.current === "ringing" &&
                      duration < 30
                    ) {
                      setError(
                        "Call rejected - The other party declined the call"
                      );
                    } else if (duration < 5) {
                      setError("Call failed - Number not reachable");
                    }
                  }

                  performCallCleanup(call, currentDialedNumber || "", {
                    hangup_cause: hangupCause,
                    hangup_source: hangupSource,
                    telnyx_call_id: call.id,
                    telnyx_leg_id: call.leg_id,
                    sip_response_code: call.sip_response_code,
                    sip_response_text: call.sip_response_text,
                    error_code: call.error_code,
                    error_message: call.error_message,
                  });
                } else {
                  handleCallDestroy(call, currentDialedNumber || "");
                }
                transitionCallState("ended", call);
              } else {
                // Direct state mapping
                transitionCallState(targetUIState, call);
              }
            }
          }
        } else if (notification.type === "userMediaError") {
          console.error("❌ User media error:", notification.error);
          setError("Microphone access required for calls");
        }
      });

      // Call events - Only for new call creation
      telnyxClient.on("call", (call: any) => {
        console.log(`📞 New call created: ${call.state} for ${call.id}`);
        // This event is only for new call creation, not state changes
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

  // REMOVED: handleCallStateChange function - state changes now handled by telnyx.notification events

  // SIMPLIFIED CALL HANDLING - PURE EVENT-DRIVEN (NO POLLING)
  const handleCallCreation = useCallback((call: any, phoneNumber: string) => {
    // Set initial call state
    setCurrentCall(call);
    setCallControlId(call.id);
    setCallStartTime(Date.now());
    setCurrentDialedNumber(phoneNumber);

    // Store the phone number in the call object to prevent race conditions
    if (call) {
      call.dialedPhoneNumber = phoneNumber;
    }

    console.log(`📞 Call created: ${call.state} for ${phoneNumber}`);

    // REMOVED: Individual call event listeners don't exist in Telnyx WebRTC SDK
    // State changes are now handled by telnyx.notification events in setupEventHandlers

    // REMOVED: Polling mechanism - no longer needed with proper telnyx.notification events
  }, []);

  // REWRITTEN CALL EVENT HANDLERS - Using native Telnyx events
  const performCallCleanup = useCallback(
    (
      call: any,
      phoneNumber: string,
      nativeEventData?: {
        hangup_cause?: string;
        hangup_source?: string;
        telnyx_call_id?: string;
        telnyx_leg_id?: string;
        voice_mail_detected?: boolean;
        machine_answer?: boolean;
        amd_result?: string;
        sip_response_code?: number;
        sip_response_text?: string;
        error_code?: string;
        error_message?: string;
      }
    ) => {
      // Use connected time for duration calculation if call was connected, otherwise use start time
      const duration = callConnectedTime
        ? Math.floor((Date.now() - callConnectedTime) / 1000)
        : callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;

      // Determine call status using native Telnyx events
      let callStatus: "completed" | "failed" | "voicemail" = "completed";

      // Use native Telnyx hangup cause to determine call status
      const hangupCause = nativeEventData?.hangup_cause;
      const hangupSource = nativeEventData?.hangup_source;
      const voiceMailDetected =
        nativeEventData?.voice_mail_detected || call.voice_mail_detected;
      const machineAnswer =
        nativeEventData?.machine_answer || call.machine_answer;
      const amdResult = nativeEventData?.amd_result || call.amd_result;

      console.log("🔍 performCallCleanup - Native event data:", {
        hangup_cause: hangupCause,
        hangup_source: hangupSource,
        voice_mail_detected: voiceMailDetected,
        machine_answer: machineAnswer,
        amd_result: amdResult,
        duration: duration,
        call_state: callState,
      });

      // Determine call status based on native Telnyx events
      if (voiceMailDetected || machineAnswer || amdResult === "machine") {
        callStatus = "voicemail";
      } else if (
        hangupCause === "call_rejected" ||
        hangupCause === "rejected" ||
        hangupCause === "busy" ||
        hangupCause === "user_busy" ||
        hangupCause === "no_answer" ||
        hangupCause === "no-answer" ||
        hangupCause === "unallocated_number" ||
        hangupCause === "invalid_number" ||
        hangupCause === "network_error" ||
        hangupCause === "timeout"
      ) {
        callStatus = "failed";
      } else if (
        hangupCause === "normal_clearing" &&
        (hangupSource === "caller" || hangupSource === "callee")
      ) {
        callStatus = "completed";
      } else {
        // Default to failed for unknown cases to avoid false positives
        callStatus = "failed";
      }

      // Set error if call failed or voice mail (but only if not already set)
      if (callStatus === "failed" || callStatus === "voicemail") {
        console.log("🔍 performCallCleanup - Call status:", callStatus);
        console.log("🔍 performCallCleanup - Current error:", error);

        // Only set error if it's not already set to avoid duplicates
        if (
          !error ||
          !error.includes("failed") ||
          !error.includes("voice mail")
        ) {
          // Error message should already be set by the hangup handler
          console.log(
            "🔍 performCallCleanup - Error already set by hangup handler"
          );
        } else {
          console.log(
            "🔍 performCallCleanup - Error already set, not overriding"
          );
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

      // Track call in Supabase with native event data
      trackCall(call, callStatus, duration, phoneNumber, nativeEventData);

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // FIXED: Remove the recursive call.hangup() that was causing infinite loops
      // The call is already ending/hanging up, so we don't need to call hangup again
      // This was the root cause of the "Maximum call stack size exceeded" error

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCallConnectedTime(null);
      setCurrentDialedNumber(null);
      setWasCallConnected(false);
    },
    [
      callStartTime,
      callConnectedTime,
      callState,
      error,
      transitionCallState,
      trackCall,
      notifyCallStatus,
    ]
  );

  // Keep the old function name for backward compatibility but redirect to the new one
  const handleCallHangup = performCallCleanup;

  const handleCallDestroy = useCallback(
    (call: any, phoneNumber: string) => {
      // Use connected time for duration calculation if call was connected, otherwise use start time
      const duration = callConnectedTime
        ? Math.floor((Date.now() - callConnectedTime) / 1000)
        : callStartTime
        ? Math.floor((Date.now() - callStartTime) / 1000)
        : 0;

      // FIXED: Default to failed instead of completed to prevent false positives
      let callStatus: "completed" | "failed" = "failed";
      let errorMessage = "Call failed - Unable to determine status";

      // Only mark as completed if we have clear indicators of success
      if (duration > 5 && wasCallConnected) {
        // Longer call that was connected - likely successful
        callStatus = "completed";
        errorMessage = "";
      } else if (duration < 1) {
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

      // REMOVED: trackCall() to prevent duplicate database entries
      // Call tracking is now handled centrally in performCallCleanup()
      console.log(
        "🔍 handleCallDestroy - Call status:",
        callStatus,
        "Duration:",
        duration
      );

      // Notify status
      notifyCallStatus(callStatus, phoneNumber);

      // FIXED: Remove the recursive call.hangup() that was causing infinite loops
      // The call is already ending/destroying, so we don't need to call hangup again
      // This prevents the "Maximum call stack size exceeded" error

      // Clean up call state
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCallConnectedTime(null);
      setCurrentDialedNumber(null);
      setWasCallConnected(false);
    },
    [
      callStartTime,
      callConnectedTime,
      error,
      transitionCallState,
      trackCall,
      notifyCallStatus,
    ]
  );

  const handleCallFailed = useCallback(
    (call: any, phoneNumber: string) => {
      try {
        // Use connected time for duration calculation if call was connected, otherwise use start time
        const duration = callConnectedTime
          ? Math.floor((Date.now() - callConnectedTime) / 1000)
          : callStartTime
          ? Math.floor((Date.now() - callStartTime) / 1000)
          : 0;

        // Set error message (but only if not already set)
        if (!error || !error.includes("failed")) {
          setError("Call failed - Unable to connect");
        }

        // Keep current state for error popup display
        // transitionCallState("failed", call); // REMOVED - let error popup handle this

        // REMOVED: trackCall() to prevent duplicate database entries
        // Call tracking is now handled centrally in performCallCleanup()
        console.log("🔍 handleCallFailed - Call failed, duration:", duration);

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
        setCallConnectedTime(null);
        setCurrentDialedNumber(null);
        setWasCallConnected(false);
      } catch (error) {
        console.error("🚨 Error in handleCallFailed:", error);
        // Fallback cleanup
        setCurrentCall(null);
        setCallControlId(null);
        setCallStartTime(null);
        setCallConnectedTime(null);
        setCurrentDialedNumber(null);
        setWasCallConnected(false);
        setError("Call failed - Unable to connect");
      }
    },
    [callStartTime, callConnectedTime, trackCall, notifyCallStatus, error]
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

        // CRITICAL FIX: Get microphone access with proper error handling and retry logic
        await initializeMicrophoneAccess();

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
    cleanupAll,
    client,
    initializeMicrophoneAccess,
    setupEventHandlers,
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

      // CRITICAL FIX: Ensure we're in a clean state before making a call
      if (callState === "ended") {
        console.log("🔄 Detected ended state, forcing reset before new call");
        setCallState("idle");
        setIsConnecting(false);
        setIsCallActive(false);
        setCurrentCall(null);
        setCallControlId(null);
        setCallStartTime(null);
        setCallConnectedTime(null);
        setCurrentDialedNumber(null);
        setWasCallConnected(false);
        setError(null);
        currentCallStateRef.current = "idle";
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
    [
      currentCall,
      transitionCallState,
      makeCall,
      attemptReconnection,
      error,
      isInitializing,
      isReconnecting,
    ]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const forceResetCallState = useCallback(() => {
    console.log("🔄 Force resetting call state from:", callState);

    // CRITICAL FIX: Always force immediate transition to idle
    setCallState("idle");
    setIsConnecting(false);
    setIsCallActive(false);
    setCurrentCall(null);
    setCallControlId(null);
    setCallStartTime(null);
    setCallConnectedTime(null);
    setCurrentDialedNumber(null);
    setWasCallConnected(false);
    setTrackedCallIds(new Set()); // Clear tracked call IDs
    setError(null);

    // Update ref immediately
    currentCallStateRef.current = "idle";

    // Clean up any pending timeouts
    timeoutManager.current.clearAll();

    console.log("🔄 Call state force reset to idle completed");
  }, []);

  // Function to properly handle call failure completion (called by error popup)
  const completeCallFailure = useCallback(() => {
    try {
      transitionCallState("idle");
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCallConnectedTime(null);
      setCurrentDialedNumber(null);
      setWasCallConnected(false);
    } catch (error) {
      // Error in completeCallFailure
      // Fallback cleanup
      setCurrentCall(null);
      setCallControlId(null);
      setCallStartTime(null);
      setCallConnectedTime(null);
      setCurrentDialedNumber(null);
      setWasCallConnected(false);
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
    currentCall,

    // Audio state
    hasMicrophoneAccess,
    retryMicrophoneAccess,
    validateMicrophoneAccess,
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

    // Call flow monitoring
    getCallFlowHealth: getCallFlowHealthCheck,
  };
};
