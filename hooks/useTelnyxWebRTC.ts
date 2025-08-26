import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { DatabaseService } from "@/lib/database";

// State machine for call states
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

interface TelnyxConfig {
  apiKey: string;
  sipUsername: string;
  sipPassword: string;
  phoneNumber: string;
}

interface UseTelnyxWebRTCReturn {
  isConnected: boolean;
  isCallActive: boolean;
  isConnecting: boolean;
  error: string | null;
  hasMicrophoneAccess: boolean;
  callControlId: string | null;
  callState: CallState;
  makeCall: (phoneNumber: string) => Promise<void>;
  hangupCall: () => void;
  sendDTMF: (digit: string) => void;
  debugAudioSetup: () => void;
  onCallStatusChange?: (
    status: "completed" | "failed" | "missed" | "incoming",
    phoneNumber?: string,
    duration?: number
  ) => void;
}

export const useTelnyxWebRTC = (
  config: TelnyxConfig,
  userId?: string,
  onCallStatusChange?: (
    status: "completed" | "failed" | "missed" | "incoming",
    phoneNumber?: string,
    duration?: number
  ) => void
) => {
  const [client, setClient] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState(false);
  const [callControlId, setCallControlId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [reconnectionAttempts, setReconnectionAttempts] = useState(0);
  const [networkQuality, setNetworkQuality] = useState<
    "excellent" | "good" | "fair" | "poor"
  >("good");
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Call state management
  const [callState, setCallState] = useState<CallState>("idle");

  // Timeout refs to prevent race conditions
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tryingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for audio elements
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  // Refs for audio context and gain node for fallback
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (
      !config.apiKey ||
      !config.sipUsername ||
      !config.sipPassword ||
      !config.phoneNumber
    ) {
      setError("Missing Telnyx credentials");
      return;
    }

    const initializeClient = async () => {
      try {
        // Check if TelnyxRTC is available
        if (typeof TelnyxRTC === "undefined") {
          setError("Telnyx WebRTC SDK not loaded");
          return;
        }

        // Get microphone access first
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
          console.log("Microphone access granted");
        } catch (micError) {
          console.error("Failed to get microphone access:", micError);
          setError("Microphone access required for calls");
          return;
        }

        const telnyxClient = new TelnyxRTC({
          login_token: config.apiKey,
          login: config.sipUsername,
          password: config.sipPassword,
        });

        // Debug: Log available methods on the client
        console.log("Telnyx client created:", telnyxClient);
        console.log(
          "Available methods:",
          Object.getOwnPropertyNames(Object.getPrototypeOf(telnyxClient))
        );
        console.log(
          "Has newCall method:",
          typeof telnyxClient.newCall === "function"
        );
        console.log("Has on method:", typeof telnyxClient.on === "function");

        // Check for alternative method names
        console.log(
          "Has call method:",
          typeof (telnyxClient as any).call === "function"
        );
        console.log(
          "Has createCall method:",
          typeof (telnyxClient as any).createCall === "function"
        );
        console.log(
          "Has addEventListener method:",
          typeof (telnyxClient as any).addEventListener === "function"
        );

        // Set up event listeners
        telnyxClient.on("telnyx.ready", () => {
          console.log("Telnyx client ready");
          setIsConnected(true);
          setError(null);
        });

        telnyxClient.on("telnyx.error", (error: any) => {
          console.error("Telnyx client error:", error);
          setError(`Telnyx error: ${error.message || "Unknown error"}`);
          setIsConnected(false);
        });

        telnyxClient.on("telnyx.close", () => {
          console.log("Telnyx client closed");
          setIsConnected(false);
          setError("Connection closed");
        });

        // Handle call events
        telnyxClient.on("call", (call: any) => {
          console.log("Call event received:", call);
          if (call.state) {
            console.log("Call state:", call.state);
            switch (call.state) {
              case "ringing":
                transitionCallState("ringing", call);
                break;
              case "answered":
                transitionCallState("answered", call);
                // Track successful call completion if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: call.phoneNumber || config.phoneNumber,
                    status: "completed",
                    call_control_id: call.call_control_id,
                  });
                }

                // Notify parent of successful call
                if (onCallStatusChange) {
                  onCallStatusChange(
                    "completed",
                    call.phoneNumber || config.phoneNumber,
                    undefined // Duration not available yet
                  );
                }
                break;
              case "ended":
              case "hangup":
              case "destroy":
                console.log("Call ended:", call.state);
                transitionCallState("ended", call);
                // Notify parent of call end
                if (onCallStatusChange) {
                  onCallStatusChange(
                    "completed",
                    call.phoneNumber || config.phoneNumber,
                    undefined // Duration not available for this event
                  );
                }
                break;
              default:
                console.log("Unknown call state:", call.state);
                if (
                  call.state.includes("fail") ||
                  call.state.includes("error")
                ) {
                  transitionCallState("failed", call);
                  setError(`Call failed: ${call.state}`);
                  // Track failed call if userId is provided
                  if (userId) {
                    DatabaseService.trackCall({
                      user_id: userId,
                      phone_number: call.phoneNumber || config.phoneNumber,
                      status: "failed",
                      call_control_id: call.call_control_id,
                    });
                  }

                  // Notify parent of failed call
                  if (onCallStatusChange) {
                    onCallStatusChange(
                      "failed",
                      call.phoneNumber || config.phoneNumber,
                      undefined // Duration not available for failed calls
                    );
                  }
                }
                break;
            }
          }
        });

        // Add specific event listeners for better call state handling
        telnyxClient.on("call.hangup", (call: any) => {
          console.log("Call hangup event received");
          const duration = callStartTime
            ? Math.floor((Date.now() - callStartTime) / 1000)
            : undefined;
          transitionCallState("ended", call);
          if (onCallStatusChange) {
            onCallStatusChange(
              "completed",
              call.phoneNumber || config.phoneNumber,
              duration
            );
          }
        });

        // Handle call failures (including invalid phone numbers)
        telnyxClient.on("call.failed", (call: any) => {
          console.log("Call failed event received:", call);
          transitionCallState("failed", call);
          setError("Call failed - Invalid phone number or connection error");

          // Track failed call if userId is provided
          if (userId) {
            DatabaseService.trackCall({
              user_id: userId,
              phone_number: call.phoneNumber || config.phoneNumber,
              status: "failed",
              call_control_id: call.call_control_id,
            });
          }

          // Notify parent of failed call
          if (onCallStatusChange) {
            onCallStatusChange(
              "failed",
              call.phoneNumber || config.phoneNumber,
              undefined
            );
          }
        });

        // Handle call rejections
        telnyxClient.on("call.rejected", (call: any) => {
          console.log("Call rejected event received:", call);
          transitionCallState("failed", call);
          setError("Call rejected - Number may be invalid or unavailable");

          // Track rejected call if userId is provided
          if (userId) {
            DatabaseService.trackCall({
              user_id: userId,
              phone_number: call.phoneNumber || config.phoneNumber,
              status: "failed",
              call_control_id: call.call_control_id,
            });
          }

          // Notify parent of rejected call
          if (onCallStatusChange) {
            onCallStatusChange(
              "failed",
              call.phoneNumber || config.phoneNumber,
              undefined
            );
          }
        });

        // Handle call errors
        telnyxClient.on("call.error", (call: any, error: any) => {
          console.log("Call error event received:", call, error);
          transitionCallState("error", call);
          setError(`Call error: ${error?.message || "Unknown error occurred"}`);

          // Track failed call if userId is provided
          if (userId) {
            DatabaseService.trackCall({
              user_id: userId,
              phone_number: call.phoneNumber || config.phoneNumber,
              status: "failed",
              call_control_id: call.call_control_id,
            });
          }

          // Notify parent of failed call
          if (onCallStatusChange) {
            onCallStatusChange(
              "failed",
              call.phoneNumber || config.phoneNumber,
              undefined
            );
          }
        });

        telnyxClient.on("call.destroy", (call: any) => {
          console.log("Call destroy event received");
          const duration = callStartTime
            ? Math.floor((Date.now() - callStartTime) / 1000)
            : undefined;

          // Check if call was destroyed due to an error or normal completion
          if (call.state === "hangup" && callState === "connecting") {
            // Call was hung up while connecting - likely invalid number or network issue
            setError(
              "Call failed - Phone number may be invalid or unavailable"
            );
            transitionCallState("failed", call);
          } else if (call.state === "destroy" && callState === "connecting") {
            // Call was destroyed while connecting - likely a connection issue
            setError(
              "Call connection failed - Please check your network connection"
            );
            transitionCallState("failed", call);
          } else {
            // Normal call completion
            transitionCallState("ended", call);
          }

          if (onCallStatusChange) {
            onCallStatusChange(
              "completed",
              call.phoneNumber || config.phoneNumber,
              duration
            );
          }
        });

        // Network resilience and monitoring
        telnyxClient.on("connection.lost", () => {
          console.log("Connection lost - attempting to reconnect");
          setIsConnected(false);
          setError("Connection lost - attempting to reconnect...");
          setIsReconnecting(true);

          // Attempt reconnection with exponential backoff
          attemptReconnection();
        });

        telnyxClient.on("connection.restored", () => {
          console.log("Connection restored successfully");
          setIsConnected(true);
          setIsReconnecting(false);
          setReconnectionAttempts(0);
          setError(null);
          setNetworkQuality("good");
        });

        telnyxClient.on("connection.failed", () => {
          console.log("Reconnection failed");
          setIsReconnecting(false);
          setError(
            "Failed to reconnect - please check your connection and try again"
          );

          // Reset reconnection attempts after a delay
          setTimeout(() => {
            setReconnectionAttempts(0);
          }, 30000); // 30 seconds
        });

        // Network quality monitoring
        telnyxClient.on("network.quality", (quality: any) => {
          console.log("Network quality update:", quality);
          if (quality && quality.score) {
            const score = quality.score;
            if (score >= 0.8) setNetworkQuality("excellent");
            else if (score >= 0.6) setNetworkQuality("good");
            else if (score >= 0.4) setNetworkQuality("fair");
            else setNetworkQuality("poor");
          }
        });

        setClient(telnyxClient);

        // Connect to Telnyx
        telnyxClient.connect();
      } catch (err) {
        console.error("Failed to initialize Telnyx client:", err);
        setError("Failed to initialize WebRTC client");
      }
    };

    initializeClient();

    return () => {
      // Clean up audio and streaming
      cleanupAudio();
      stopCallStreaming();

      // Disconnect client
      if (client) {
        client.disconnect();
      }
    };
  }, [
    config.apiKey,
    config.sipUsername,
    config.sipPassword,
    config.phoneNumber,
  ]);

  // Start call streaming using Telnyx Call Control API
  const startCallStreaming = useCallback(async (callControlId: string) => {
    try {
      console.log("Starting call streaming for:", callControlId);

      // Create WebSocket connection for streaming audio
      // Note: This requires proper authentication headers which WebSocket doesn't support
      // We'll use the Telnyx SDK's built-in audio handling instead
      console.log(
        "Using Telnyx SDK built-in audio streaming instead of WebSocket API"
      );

      // The Telnyx WebRTC SDK should handle audio streams automatically
      // We just need to ensure our audio elements are properly connected
    } catch (err) {
      console.error("Failed to start call streaming:", err);
      setError("Failed to start audio streaming");
    }
  }, []);

  // Stop call streaming
  const stopCallStreaming = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
  }, []);

  // Handle incoming audio stream data
  const handleAudioStreamData = useCallback((audioData: any) => {
    try {
      // Convert base64 audio data to audio buffer
      if (audioData.encoding === "base64" && audioData.payload) {
        // Create audio context and decode the audio data
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();

        // Convert base64 to array buffer
        const binaryString = atob(audioData.payload);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Decode audio data
        audioContext.decodeAudioData(
          bytes.buffer,
          (buffer) => {
            // Create audio source and connect to destination
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
          },
          (error) => {
            console.error("Failed to decode audio data:", error);
          }
        );
      }
    } catch (err) {
      console.error("Failed to handle audio stream data:", err);
    }
  }, []);

  // Handle call answered and set up audio streams
  const handleCallAnswered = useCallback((call: any) => {
    try {
      // Create audio elements if they don't exist
      if (!localAudioRef.current) {
        localAudioRef.current = document.createElement("audio");
        localAudioRef.current.autoplay = true;
        localAudioRef.current.muted = true; // Mute local audio to prevent feedback
        document.body.appendChild(localAudioRef.current);
      }

      if (!remoteAudioRef.current) {
        remoteAudioRef.current = document.createElement("audio");
        remoteAudioRef.current.autoplay = true;
        remoteAudioRef.current.volume = 1.0;
        document.body.appendChild(remoteAudioRef.current);
      }

      // Set up local audio stream (microphone)
      if (localStreamRef.current) {
        localAudioRef.current.srcObject = localStreamRef.current;
        console.log("Local audio stream set up");
      }

      // Set up remote audio stream from the call
      if (call.remoteStream) {
        remoteAudioRef.current.srcObject = call.remoteStream;
        console.log("Remote audio stream set up");
      } else if (call.getRemoteStream) {
        // Some versions of Telnyx use getRemoteStream method
        const remoteStream = call.getRemoteStream();
        if (remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
          console.log("Remote audio stream set up via getRemoteStream");
        }
      }

      // Set up call event handlers for audio
      call.on("remoteStream", (stream: MediaStream) => {
        console.log("Remote stream received:", stream);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
        }
      });

      call.on("localStream", (stream: MediaStream) => {
        console.log("Local stream received:", stream);
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream;
        }
      });
    } catch (err) {
      console.error("Failed to set up audio streams:", err);
      setError("Failed to set up audio for call");
    }
  }, []);

  // Set up audio streams for an active call
  const setupCallAudioStreams = useCallback((call: any) => {
    try {
      console.log("Setting up audio streams for call:", call);

      // Create audio elements if they don't exist
      if (!localAudioRef.current) {
        localAudioRef.current = document.createElement("audio");
        localAudioRef.current.autoplay = true;
        localAudioRef.current.muted = true; // Mute local audio to prevent feedback
        document.body.appendChild(localAudioRef.current);
      }

      if (!remoteAudioRef.current) {
        remoteAudioRef.current = document.createElement("audio");
        remoteAudioRef.current.autoplay = true;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.muted = false; // Ensure remote audio is NOT muted
        document.body.appendChild(remoteAudioRef.current);
      }

      // Set up local audio stream (microphone) - this is crucial for them to hear you
      if (localStreamRef.current) {
        localAudioRef.current.srcObject = localStreamRef.current;
        console.log("Local audio stream (microphone) connected to call");

        // Ensure the local stream is also connected to the call for outbound audio
        if (call.addTrack && typeof call.addTrack === "function") {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) {
            call.addTrack(audioTrack);
            console.log("Local audio track added to call for outbound audio");
          }
        }
      }

      // CRITICAL: Set up remote audio stream from the call - this is for you to hear them
      // Try multiple approaches to get the remote stream
      let remoteStreamFound = false;

      // Method 1: Check if call already has remoteStream
      if (call.remoteStream) {
        console.log("Remote stream found on call object:", call.remoteStream);
        remoteAudioRef.current.srcObject = call.remoteStream;
        remoteStreamFound = true;
      }

      // Method 2: Try getRemoteStream method
      if (
        !remoteStreamFound &&
        call.getRemoteStream &&
        typeof call.getRemoteStream === "function"
      ) {
        try {
          const remoteStream = call.getRemoteStream();
          if (remoteStream) {
            console.log(
              "Remote stream obtained via getRemoteStream:",
              remoteStream
            );
            remoteAudioRef.current.srcObject = remoteStream;
            remoteStreamFound = true;
          }
        } catch (err) {
          console.error("getRemoteStream failed:", err);
        }
      }

      // Method 3: Check if call has a peerConnection with remote tracks
      if (!remoteStreamFound && call.peerConnection) {
        try {
          const pc = call.peerConnection;
          const remoteTracks = pc
            .getReceivers()
            .map((receiver: any) => receiver.track)
            .filter((track: any) => track && track.kind === "audio");
          if (remoteTracks.length > 0) {
            const remoteStream = new MediaStream(remoteTracks);
            console.log(
              "Remote stream created from peer connection tracks:",
              remoteStream
            );
            remoteAudioRef.current.srcObject = remoteStream;
            remoteStreamFound = true;
          }
        } catch (err) {
          console.error(
            "Failed to get remote tracks from peer connection:",
            err
          );
        }
      }

      if (!remoteStreamFound) {
        console.warn(
          "No remote stream found initially - will wait for remoteStream event"
        );
      }

      // Set up call event handlers for dynamic audio streams
      try {
        call.on("remoteStream", (stream: MediaStream) => {
          console.log("Remote stream received dynamically:", stream);
          if (remoteAudioRef.current && stream) {
            remoteAudioRef.current.srcObject = stream;
            console.log("Remote audio stream connected for inbound audio");

            // Test if audio is actually playing
            remoteAudioRef.current
              .play()
              .then(() => {
                console.log("Remote audio started playing successfully");
              })
              .catch((err) => {
                console.error("Failed to play remote audio:", err);
              });
          }
        });
      } catch (err) {
        console.error("Failed to set up remoteStream event handler:", err);
      }

      try {
        call.on("localStream", (stream: MediaStream) => {
          console.log("Local stream received dynamically:", stream);
          if (localAudioRef.current) {
            localAudioRef.current.srcObject = stream;
          }
        });
      } catch (err) {
        console.error("Failed to set up localStream event handler:", err);
      }

      // Additional event handlers for Telnyx specific events
      try {
        call.on("track", (event: any) => {
          console.log("Track event received:", event);
          if (
            event.track &&
            event.track.kind === "audio" &&
            event.track.direction === "recvonly"
          ) {
            console.log("Remote audio track received:", event.track);
            const remoteStream = new MediaStream([event.track]);
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
              console.log("Remote audio track connected to audio element");
            }
          }
        });
      } catch (err) {
        console.error("Failed to set up track event handler:", err);
      }
    } catch (err) {
      console.error("Failed to set up call audio streams:", err);
      setError("Failed to set up audio streams for call");
    }
  }, []);

  // Clean up audio elements and streams
  const cleanupAudio = useCallback(() => {
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
      localAudioRef.current.remove();
      localAudioRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }, []);

  // Clean up all timeouts and intervals
  const cleanupTimeouts = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (tryingTimeoutRef.current) {
      clearTimeout(tryingTimeoutRef.current);
      tryingTimeoutRef.current = null;
    }
    if (statusCheckRef.current) {
      clearInterval(statusCheckRef.current);
      statusCheckRef.current = null;
    }
  }, []);

  // State transition function to ensure valid state changes
  const transitionCallState = useCallback(
    (newState: CallState, call?: any) => {
      console.log(`Call state transition: ${callState} -> ${newState}`);

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

      if (!validTransitions[callState].includes(newState)) {
        console.warn(`Invalid state transition: ${callState} -> ${newState}`);
        return;
      }

      setCallState(newState);

      // Update related states based on call state
      switch (newState) {
        case "idle":
          setIsConnecting(false);
          setIsCallActive(false);
          setCurrentCall(null);
          setCallControlId(null);
          setCallStartTime(null);
          setError(null);
          cleanupAudio();
          stopCallStreaming();
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
          setIsConnecting(false);
          setIsCallActive(false);
          setCurrentCall(null);
          setCallControlId(null);
          setError(null);
          cleanupAudio();
          stopCallStreaming();
          break;
        case "failed":
        case "error":
          setIsConnecting(false);
          setIsCallActive(false);
          setCurrentCall(null);
          setCallControlId(null);
          cleanupAudio();
          stopCallStreaming();
          break;
      }
    },
    [callState, callStartTime, cleanupAudio, stopCallStreaming]
  );

  // Network reconnection logic with exponential backoff
  const attemptReconnection = useCallback(async () => {
    if (reconnectionAttempts >= 5) {
      console.log("Max reconnection attempts reached");
      setError(
        "Unable to reconnect after multiple attempts. Please refresh the page."
      );
      setIsReconnecting(false);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectionAttempts), 30000); // Max 30 seconds
    console.log(
      `Attempting reconnection in ${delay}ms (attempt ${
        reconnectionAttempts + 1
      })`
    );

    setTimeout(async () => {
      try {
        if (client && typeof client.connect === "function") {
          console.log("Attempting to reconnect...");
          await client.connect();
          setReconnectionAttempts((prev) => prev + 1);
        }
      } catch (err) {
        console.error("Reconnection attempt failed:", err);
        setReconnectionAttempts((prev) => prev + 1);

        // Try again if we haven't reached max attempts
        if (reconnectionAttempts < 4) {
          attemptReconnection();
        }
      }
    }, delay);
  }, [client, reconnectionAttempts]);

  // Make a call
  const makeCall = useCallback(
    async (phoneNumber: string) => {
      if (!client || !isConnected) {
        setError("Not connected to Telnyx");
        return;
      }

      // Basic phone number validation
      const cleanedNumber = phoneNumber.replace(/[^\d+]/g, "");
      if (cleanedNumber.length < 7) {
        setError("Phone number must be at least 7 digits");
        return;
      }

      // Additional validation for common invalid patterns
      if (
        cleanedNumber === "0000000000" ||
        cleanedNumber === "1111111111" ||
        cleanedNumber === "9999999999" ||
        cleanedNumber === "1234567890"
      ) {
        setError("Please enter a valid phone number");
        return;
      }

      if (!hasMicrophoneAccess) {
        setError("Microphone access required for calls");
        return;
      }

      try {
        setIsConnecting(true);
        setError(null);
        console.log("Attempting to make call to:", phoneNumber);

        const handleCallCreation = (call: any) => {
          // Validate that call object is created and has required methods
          if (!call || typeof call !== "object") {
            throw new Error("Failed to create call object");
          }

          console.log("Call object created:", call);
          console.log("Call object type:", typeof call);
          console.log("Call object keys:", Object.keys(call));
          console.log("Call object prototype:", Object.getPrototypeOf(call));
          console.log("Has 'on' method:", typeof call.on === "function");
          console.log(
            "Has 'addEventListener' method:",
            typeof call.addEventListener === "function"
          );
          console.log(
            "Has 'addListener' method:",
            typeof call.addListener === "function"
          );

          // Try to find the correct event handling method
          let eventHandler: any = null;
          if (typeof call.on === "function") {
            eventHandler = call.on;
            console.log("Using call.on method");
          } else if (typeof call.addEventListener === "function") {
            eventHandler = call.addEventListener;
            console.log("Using call.addEventListener method");
          } else if (typeof call.addListener === "function") {
            eventHandler = call.addListener;
            console.log("Using call.addListener method");
          } else {
            console.warn("No event handling method found on call object");
            // Continue without event handlers - the call might still work
          }

          if (eventHandler) {
            // Set up call event handlers with proper error handling
            try {
              eventHandler("ringing", () => {
                console.log("Call is ringing - setting connecting state");
                setIsConnecting(true);
                setIsCallActive(false);
                setCurrentCall(call);
                setError(null); // Clear any previous errors

                // Extract call control ID
                if (call.call_control_id) {
                  setCallControlId(call.call_control_id);
                }
              });
            } catch (err) {
              console.error("Failed to set up ringing event handler:", err);
            }

            try {
              eventHandler("answered", () => {
                console.log("Call answered - setting active state");
                setIsConnecting(false);
                setIsCallActive(true);
                setCurrentCall(call);
                setError(null);
                setCallStartTime(Date.now()); // Start tracking call duration

                // Extract call control ID if not already set
                if (call.call_control_id && !callControlId) {
                  setCallControlId(call.call_control_id);
                }

                // Set up audio streams immediately when call is answered
                setupCallAudioStreams(call);

                // Debug audio setup after a short delay
                setTimeout(() => {
                  debugAudioSetup();
                }, 1000);

                // Start call streaming to receive audio
                if (call.call_control_id) {
                  startCallStreaming(call.call_control_id);
                }
              });
            } catch (err) {
              console.error("Failed to set up answered event handler:", err);
            }

            try {
              eventHandler("ended", () => {
                console.log("Call ended");
                const duration = callStartTime
                  ? Math.floor((Date.now() - callStartTime) / 1000)
                  : undefined;
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setCallStartTime(null);
                cleanupAudio();
                stopCallStreaming();

                // Notify parent of call end with duration
                if (onCallStatusChange) {
                  onCallStatusChange(
                    "completed",
                    call.phoneNumber || config.phoneNumber,
                    duration
                  );
                }
              });
            } catch (err) {
              console.error("Failed to set up ended event handler:", err);
            }

            // Add missing state handlers for comprehensive call management
            try {
              eventHandler("busy", () => {
                console.log("Call busy - number is busy");
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError("Number is busy - please try again later");
                cleanupAudio();
                stopCallStreaming();

                // Track failed call if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: phoneNumber,
                    status: "failed",
                  });
                }

                // Notify parent of failed call
                if (onCallStatusChange) {
                  onCallStatusChange("failed", phoneNumber, undefined);
                }
              });
            } catch (err) {
              console.error("Failed to set up busy event handler:", err);
            }

            try {
              eventHandler("no-answer", () => {
                console.log("Call no-answer - no one answered");
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError("No answer - please try again later");
                cleanupAudio();
                stopCallStreaming();

                // Track failed call if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: phoneNumber,
                    status: "failed",
                  });
                }

                // Notify parent of failed call
                if (onCallStatusChange) {
                  onCallStatusChange("failed", phoneNumber, undefined);
                }
              });
            } catch (err) {
              console.error("Failed to set up no-answer event handler:", err);
            }

            try {
              eventHandler("forwarded", () => {
                console.log("Call forwarded - call was forwarded");
                // Keep call active but update status
                setError("Call was forwarded to another number");
              });
            } catch (err) {
              console.error("Failed to set up forwarded event handler:", err);
            }

            try {
              eventHandler("queued", () => {
                console.log("Call queued - waiting in queue");
                setError("Call is in queue - please wait");
              });
            } catch (err) {
              console.error("Failed to set up queued event handler:", err);
            }

            try {
              eventHandler("cancelled", () => {
                console.log("Call cancelled - call was cancelled");
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError("Call was cancelled");
                cleanupAudio();
                stopCallStreaming();

                // Track cancelled call if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: phoneNumber,
                    status: "failed",
                  });
                }

                // Notify parent of cancelled call
                if (onCallStatusChange) {
                  onCallStatusChange("failed", phoneNumber, undefined);
                }
              });
            } catch (err) {
              console.error("Failed to set up cancelled event handler:", err);
            }

            try {
              eventHandler("remoteStream", (stream: MediaStream) => {
                console.log("Remote stream received:", stream);
                if (remoteAudioRef.current) {
                  remoteAudioRef.current.srcObject = stream;
                }
              });
            } catch (err) {
              console.error(
                "Failed to set up remoteStream event handler:",
                err
              );
            }

            // Add failure event handlers to the call object itself
            try {
              call.on("failed", (error: any) => {
                console.log("Call failed event on call object:", error);
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError(
                  `Call failed: ${
                    error?.message || "Invalid phone number or connection error"
                  }`
                );
                cleanupAudio();
                stopCallStreaming();

                // Track failed call if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: phoneNumber,
                    status: "failed",
                  });
                }

                // Notify parent of failed call
                if (onCallStatusChange) {
                  onCallStatusChange("failed", phoneNumber, undefined);
                }
              });
            } catch (err) {
              console.error(
                "Failed to set up failed event handler on call:",
                err
              );
            }

            try {
              call.on("error", (error: any) => {
                console.log("Call error event on call object:", error);
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError(
                  `Call error: ${error?.message || "Unknown error occurred"}`
                );
                cleanupAudio();
                stopCallStreaming();

                // Track failed call if userId is provided
                if (userId) {
                  DatabaseService.trackCall({
                    user_id: userId,
                    phone_number: phoneNumber,
                    status: "failed",
                  });
                }

                // Notify parent of failed call
                if (onCallStatusChange) {
                  onCallStatusChange("failed", phoneNumber, undefined);
                }
              });
            } catch (err) {
              console.error(
                "Failed to set up error event handler on call:",
                err
              );
            }
          } else {
            console.warn(
              "No event handlers set up - call may not provide real-time updates"
            );
            // Set a timeout to check call status periodically
            const checkCallStatus = setInterval(() => {
              if (call.state) {
                console.log("Call state:", call.state);
                if (call.state === "answered" || call.state === "active") {
                  setIsConnecting(false);
                  setIsCallActive(true);
                  setCurrentCall(call);
                  setError(null);
                  clearInterval(checkCallStatus);

                  // Set up audio streams
                  setupCallAudioStreams(call);

                  if (call.call_control_id) {
                    setCallControlId(call.call_control_id);
                    startCallStreaming(call.call_control_id);
                  }
                } else if (call.state === "ended" || call.state === "failed") {
                  setIsCallActive(false);
                  setIsConnecting(false);
                  setCurrentCall(null);
                  setCallControlId(null);
                  cleanupAudio();
                  stopCallStreaming();
                  clearInterval(checkCallStatus);
                }
              }
            }, 1000);
          }

          setCurrentCall(call);
          transitionCallState("connecting", call);

          // Consolidated timeout handler to prevent race conditions
          const clearAllTimeouts = () => {
            if (callTimeoutRef.current) {
              clearTimeout(callTimeoutRef.current);
              callTimeoutRef.current = null;
            }
            if (tryingTimeoutRef.current) {
              clearTimeout(tryingTimeoutRef.current);
              tryingTimeoutRef.current = null;
            }
            if (statusCheckRef.current) {
              clearInterval(statusCheckRef.current);
              statusCheckRef.current = null;
            }
          };

          // Set up periodic status check for calls without event handlers
          if (!call.on || typeof call.on !== "function") {
            statusCheckRef.current = setInterval(() => {
              if (call.state) {
                console.log("Call state check:", call.state);
                switch (call.state) {
                  case "trying":
                    transitionCallState("trying", call);
                    break;
                  case "ringing":
                    transitionCallState("ringing", call);
                    break;
                  case "answered":
                  case "active":
                    transitionCallState("active", call);
                    setupCallAudioStreams(call);
                    if (call.call_control_id) {
                      setCallControlId(call.call_control_id);
                      startCallStreaming(call.call_control_id);
                    }
                    clearAllTimeouts();
                    break;
                  case "ended":
                  case "failed":
                    transitionCallState("ended", call);
                    clearAllTimeouts();
                    break;
                }
              }
            }, 1000);
          }

          // Set timeout for calls stuck in trying state (3 seconds)
          tryingTimeoutRef.current = setTimeout(() => {
            if (callState === "trying" || callState === "connecting") {
              console.log("Call stuck in trying state - likely invalid number");
              transitionCallState("failed", call);
              setError(
                "Call failed - Phone number may be invalid or unavailable"
              );

              // Track failed call if userId is provided
              if (userId) {
                DatabaseService.trackCall({
                  user_id: userId,
                  phone_number: phoneNumber,
                  status: "failed",
                });
              }

              // Notify parent of failed call
              if (onCallStatusChange) {
                onCallStatusChange("failed", phoneNumber, undefined);
              }
              clearAllTimeouts();
            }
          }, 3000);

          // Set timeout for overall call timeout (5 seconds)
          callTimeoutRef.current = setTimeout(() => {
            if (callState === "connecting" || callState === "trying") {
              console.log("Call timeout - no response after 5 seconds");
              transitionCallState("failed", call);
              setError(
                "Call timeout - Phone number may be invalid or unavailable"
              );

              // Track failed call if userId is provided
              if (userId) {
                DatabaseService.trackCall({
                  user_id: userId,
                  phone_number: phoneNumber,
                  status: "failed",
                });
              }

              // Notify parent of failed call
              if (onCallStatusChange) {
                onCallStatusChange("failed", phoneNumber, undefined);
              }
              clearAllTimeouts();
            }
          }, 5000);
        };

        // Validate that client has newCall method
        if (typeof client.newCall !== "function") {
          // Try alternative method names
          if (typeof (client as any).call === "function") {
            console.log("Using client.call method instead of newCall");
            const call = (client as any).call({
              destinationNumber: phoneNumber,
              callerNumber: config.phoneNumber,
            });
            return handleCallCreation(call);
          } else if (typeof (client as any).createCall === "function") {
            console.log("Using client.createCall method instead of newCall");
            const call = (client as any).createCall({
              destinationNumber: phoneNumber,
              callerNumber: config.phoneNumber,
            });
            return handleCallCreation(call);
          } else {
            throw new Error(
              "Telnyx client does not have newCall, call, or createCall method"
            );
          }
        }

        const call = client.newCall({
          destinationNumber: phoneNumber,
          callerNumber: config.phoneNumber,
        });

        // Track call initiation if userId is provided
        if (userId) {
          DatabaseService.trackCall({
            user_id: userId,
            phone_number: phoneNumber,
            status: "incoming", // Will be updated when call completes
          });
        }

        // Immediately set connecting state for better UX
        console.log("Call initiated - setting connecting state immediately");
        setIsConnecting(true);
        setIsCallActive(false);
        setCurrentCall(call);

        return handleCallCreation(call);
      } catch (err: any) {
        console.error("Failed to make call:", err);
        setError(err.message || "Failed to make call");
        setIsConnecting(false);
      }
    },
    [
      client,
      isConnected,
      config.phoneNumber,
      isConnecting,
      isCallActive,
      hasMicrophoneAccess,
      handleCallAnswered,
      cleanupAudio,
      callControlId,
      startCallStreaming,
      stopCallStreaming,
    ]
  );

  // Hang up call
  const hangupCall = useCallback(() => {
    if (currentCall) {
      try {
        console.log("Attempting to hang up call");
        currentCall.hangup();
      } catch (err) {
        console.error("Failed to hang up call:", err);
        // Even if hangup fails, we should clean up our local state
      }
    }

    // Calculate call duration before cleanup
    const duration = callStartTime
      ? Math.floor((Date.now() - callStartTime) / 1000)
      : undefined;

    // Always clean up our local state and resources
    console.log("Cleaning up call resources");
    transitionCallState("ended", currentCall);

    // Notify parent of call end with duration
    if (onCallStatusChange) {
      onCallStatusChange(
        "completed",
        currentCall?.phoneNumber || config.phoneNumber,
        duration
      );
    }
  }, [
    currentCall,
    callStartTime,
    config.phoneNumber,
    onCallStatusChange,
    transitionCallState,
  ]);

  // Debug function to check audio setup
  const debugAudioSetup = useCallback(() => {
    console.log("=== AUDIO SETUP DEBUG ===");
    console.log("Local audio element:", localAudioRef.current);
    console.log("Remote audio element:", remoteAudioRef.current);
    console.log("Local stream:", localStreamRef.current);
    console.log("Current call:", currentCall);

    if (localAudioRef.current) {
      console.log("Local audio muted:", localAudioRef.current.muted);
      console.log("Local audio srcObject:", localAudioRef.current.srcObject);
    }

    if (remoteAudioRef.current) {
      console.log("Remote audio muted:", remoteAudioRef.current.muted);
      console.log("Remote audio srcObject:", remoteAudioRef.current.srcObject);
      console.log("Remote audio volume:", remoteAudioRef.current.volume);
      console.log(
        "Remote audio readyState:",
        remoteAudioRef.current.readyState
      );
    }

    if (currentCall) {
      console.log("Call object:", currentCall);
      console.log("Call remoteStream:", (currentCall as any).remoteStream);
      console.log(
        "Call has getRemoteStream:",
        typeof (currentCall as any).getRemoteStream === "function"
      );
      console.log(
        "Call has peerConnection:",
        (currentCall as any).peerConnection
      );
    }
    console.log("=== END AUDIO DEBUG ===");
  }, [currentCall]);

  // Send DTMF tones during call
  const sendDTMF = useCallback(
    (digit: string) => {
      if (currentCall && typeof currentCall.dtmf === "function") {
        try {
          currentCall.dtmf(digit);
        } catch (err) {
          console.error("Failed to send DTMF:", err);
        }
      }
    },
    [currentCall]
  );

  // Error recovery: Retry failed calls with exponential backoff
  const retryCall = useCallback(
    async (phoneNumber: string, attempts = 3) => {
      console.log(`Retrying call to ${phoneNumber} (attempt ${attempts})`);

      for (let i = 0; i < attempts; i++) {
        try {
          console.log(`Retry attempt ${i + 1}/${attempts}`);
          await makeCall(phoneNumber);
          break; // Success, exit retry loop
        } catch (err) {
          console.error(`Retry attempt ${i + 1} failed:`, err);

          if (i === attempts - 1) {
            // Last attempt failed
            setError(
              `Call failed after ${attempts} attempts. Please check the number and try again.`
            );
            throw err;
          }

          // Wait before next retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, i), 10000); // Max 10 seconds
          console.log(`Waiting ${delay}ms before next retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    },
    [makeCall]
  );

  // Error recovery: Fallback audio configuration
  const setupFallbackAudio = useCallback(() => {
    console.log("Setting up fallback audio configuration");

    try {
      // Try to create audio context with fallback options
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)({
          sampleRate: 8000, // Lower sample rate for better compatibility
          latencyHint: "interactive",
        });
      }

      // Set up fallback gain node
      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.gain.value = 0.5; // Lower volume for fallback
      }

      console.log("Fallback audio configuration set up successfully");
    } catch (err) {
      console.error("Failed to set up fallback audio:", err);
      setError("Audio setup failed - some features may not work properly");
    }
  }, []);

  // Error recovery: Graceful degradation for poor network conditions
  const handleNetworkDegradation = useCallback(() => {
    console.log("Network degradation detected, applying graceful degradation");

    if (networkQuality === "poor" || networkQuality === "fair") {
      // Show user notification about network quality
      setError(
        "Poor network detected - audio quality may be reduced for stability"
      );

      // Note: AudioContext sampleRate is read-only, so we can't modify it
      // Instead, we rely on the browser's automatic adaptation
      console.log(
        "Network quality is poor - relying on browser audio adaptation"
      );
    }
  }, [networkQuality]);

  // Add browser tab close event listener for auto hangup
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isCallActive || isConnecting) {
        console.log("Browser tab closing - auto hanging up call");

        // Try to hang up the call if possible
        if (currentCall && typeof currentCall.hangup === "function") {
          try {
            currentCall.hangup();
          } catch (err) {
            console.error("Failed to hangup call on tab close:", err);
          }
        }

        // Clean up audio resources
        cleanupAudio();
        stopCallStreaming();
        cleanupTimeouts();

        // Show confirmation dialog (optional)
        event.preventDefault();
        event.returnValue =
          "You have an active call. Are you sure you want to leave?";
        return event.returnValue;
      }
    };

    // Add the event listener
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // Clean up the event listener
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [
    isCallActive,
    isConnecting,
    currentCall,
    cleanupAudio,
    stopCallStreaming,
    cleanupTimeouts,
  ]);

  return {
    isConnected,
    isCallActive,
    isConnecting,
    error,
    hasMicrophoneAccess,
    callControlId,
    callState,
    makeCall,
    hangupCall,
    sendDTMF,
    debugAudioSetup,
    retryCall,
    setupFallbackAudio,
    handleNetworkDegradation,
    networkQuality,
    isReconnecting,
  };
};
