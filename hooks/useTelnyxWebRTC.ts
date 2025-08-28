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
  debugAudioSetup: () => void;
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
    (call: any, status: "completed" | "failed", duration?: number) => {
      if (!userId) return;

      DatabaseService.trackCall({
        user_id: userId,
        phone_number: call.phoneNumber || config.phoneNumber,
        status,
        call_control_id: call.call_control_id,
        duration,
      });
    },
    [userId, config.phoneNumber]
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

      // Call events
      telnyxClient.on("call", (call: any) => {
        if (call.state) {
          switch (call.state) {
            case "ringing":
              transitionCallState("ringing", call);
              break;
            case "answered":
              transitionCallState("answered", call);
              break;
            case "ended":
            case "hangup":
            case "destroy":
              transitionCallState("ended", call);
              break;
            default:
              if (call.state.includes("fail") || call.state.includes("error")) {
                transitionCallState("failed", call);
                setError(`Call failed: ${call.state}`);
              }
              break;
          }
        }
      });

      // Specific call event handlers
      const callEventHandlers = {
        "call.hangup": (call: any) => {
          const duration = callStartTime
            ? Math.floor((Date.now() - callStartTime) / 1000)
            : undefined;
          transitionCallState("ended", call);
          trackCall(call, "completed", duration);
          notifyCallStatus(
            "completed",
            call.phoneNumber || config.phoneNumber,
            duration
          );
        },

        "call.failed": (call: any) => {
          transitionCallState("failed", call);
          setError("Call failed - Invalid phone number or connection error");
          trackCall(call, "failed");
          notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
        },

        "call.rejected": (call: any) => {
          transitionCallState("failed", call);
          setError("Call rejected");
          trackCall(call, "failed");
          notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
        },

        "call.error": (call: any, error: any) => {
          transitionCallState("error", call);
          setError("Call failed");
          trackCall(call, "failed");
          notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
        },

        "call.busy": (call: any) => {
          transitionCallState("failed", call);
          setError("Number is busy");
          trackCall(call, "failed");
          notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
        },

        "call.no-answer": (call: any) => {
          transitionCallState("failed", call);
          setError("No answer - call timed out");
          trackCall(call, "failed");
          notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
        },

        "call.destroy": (call: any) => {
          const duration = callStartTime
            ? Math.floor((Date.now() - callStartTime) / 1000)
            : undefined;

          if (call.state === "hangup" && callState === "connecting") {
            setError(
              "Call failed - Phone number may be invalid or unavailable"
            );
            transitionCallState("failed", call);
            trackCall(call, "failed");
            notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
          } else if (call.state === "destroy" && callState === "connecting") {
            setError(
              "Call connection failed - Please check your network connection"
            );
            transitionCallState("failed", call);
            trackCall(call, "failed");
            notifyCallStatus("failed", call.phoneNumber || config.phoneNumber);
          } else {
            transitionCallState("ended", call);
            trackCall(call, "completed", duration);
            notifyCallStatus(
              "completed",
              call.phoneNumber || config.phoneNumber,
              duration
            );
          }
        },

        "call.ringing": (call: any) => {
          transitionCallState("ringing", call);
          setCurrentCall(call);
        },

        "call.answered": (call: any) => {
          transitionCallState("answered", call);
          setIsCallActive(true);
          setIsConnecting(false);
          setCallStartTime(Date.now());
          trackCall(call, "completed");
          notifyCallStatus("completed", call.phoneNumber || config.phoneNumber);
        },

        "call.progress": (call: any) => {
          // Call progress event
        },

        "call.early": (call: any) => {
          // Early media event
        },
      };

      // Register all call event handlers
      Object.entries(callEventHandlers).forEach(([event, handler]) => {
        telnyxClient.on(event, handler);
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
      callStartTime,
      callState,
      transitionCallState,
      trackCall,
      notifyCallStatus,
      attemptReconnection,
      error,
      isCallActive,
      isConnecting,
    ]
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

        const handleCallCreation = (call: any) => {
          if (!call || typeof call !== "object") {
            throw new Error("Failed to create call object");
          }

          setCurrentCall(call);
          transitionCallState("connecting", call);

          // Set timeout for call progression
          const callProgressionTimeout = setTimeout(() => {
            if (callState === "connecting" || callState === "trying") {
              transitionCallState("failed", call);
              setError(
                "Call failed - please check the phone number and try again"
              );
              trackCall(call, "failed");
              notifyCallStatus("failed", phoneNumber);
            }
          }, 15000);

          timeoutManager.current.addTimeout(callProgressionTimeout);
        };

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
          setError("Call failed");
          notifyCallStatus("failed", phoneNumber);
          return;
        }

        if (call.error || call.state === "failed" || call.state === "error") {
          transitionCallState("failed", call);
          setError("Call failed");
          notifyCallStatus("failed", phoneNumber);
          return;
        }

        return handleCallCreation(call);
      } catch (err: any) {
        console.error("Call creation failed:", err);
        setError(`Call failed: ${err.message || "Unknown error"}`);
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
    debugAudioSetup,
    triggerReconnection,
    retryMicrophoneAccess,
  };
};
