import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { DatabaseService } from "@/lib/database";

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
  makeCall: (phoneNumber: string) => Promise<void>;
  hangupCall: () => void;
  sendDTMF: (digit: string) => void;
  debugAudioSetup: () => void;
  onCallStatusChange?: (
    status: "completed" | "failed" | "missed" | "incoming",
    phoneNumber?: string
  ) => void;
}

export const useTelnyxWebRTC = (
  config: TelnyxConfig,
  userId?: string,
  onCallStatusChange?: (
    status: "completed" | "failed" | "missed" | "incoming",
    phoneNumber?: string
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

  // Refs for audio elements
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);

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
                setIsConnecting(true);
                setIsCallActive(false);
                setCurrentCall(call);
                setError(null);
                break;
              case "answered":
                setIsConnecting(false);
                setIsCallActive(true);
                setCurrentCall(call);
                setError(null);
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
                    call.phoneNumber || config.phoneNumber
                  );
                }
                break;
              case "ended":
              case "hangup":
              case "destroy":
                console.log("Call ended:", call.state);
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                setError(null); // Clear any previous errors
                cleanupAudio();
                stopCallStreaming();
                // Notify parent of call end
                if (onCallStatusChange) {
                  onCallStatusChange(
                    "completed",
                    call.phoneNumber || config.phoneNumber
                  );
                }
                break;
              default:
                console.log("Unknown call state:", call.state);
                if (
                  call.state.includes("fail") ||
                  call.state.includes("error")
                ) {
                  setIsCallActive(false);
                  setIsConnecting(false);
                  setCurrentCall(null);
                  setCallControlId(null);
                  setError(`Call failed: ${call.state}`);
                  cleanupAudio();
                  stopCallStreaming();
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
                      call.phoneNumber || config.phoneNumber
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
          setIsCallActive(false);
          setIsConnecting(false);
          setCurrentCall(null);
          setCallControlId(null);
          setError(null);
          cleanupAudio();
          stopCallStreaming();
          if (onCallStatusChange) {
            onCallStatusChange(
              "completed",
              call.phoneNumber || config.phoneNumber
            );
          }
        });

        telnyxClient.on("call.destroy", (call: any) => {
          console.log("Call destroy event received");
          setIsCallActive(false);
          setIsConnecting(false);
          setCurrentCall(null);
          setCallControlId(null);
          setError(null);
          cleanupAudio();
          stopCallStreaming();
          if (onCallStatusChange) {
            onCallStatusChange(
              "completed",
              call.phoneNumber || config.phoneNumber
            );
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

  // Make a call
  const makeCall = useCallback(
    async (phoneNumber: string) => {
      if (!client || !isConnected) {
        setError("Not connected to Telnyx");
        return;
      }

      if (!phoneNumber) {
        setError("Phone number is required");
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
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setCallControlId(null);
                cleanupAudio();
                stopCallStreaming();
              });
            } catch (err) {
              console.error("Failed to set up ended event handler:", err);
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

          // Set a timeout to catch silent failures
          setTimeout(() => {
            if (isConnecting && !isCallActive) {
              console.log("Call timeout - no response after 10 seconds");
              setIsConnecting(false);
              setError("Call timeout - Check your Telnyx configuration");
            }
          }, 10000);
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

    // Always clean up our local state and resources
    console.log("Cleaning up call resources");
    setIsCallActive(false);
    setIsConnecting(false);
    setCurrentCall(null);
    setCallControlId(null);
    setError(null); // Clear any errors
    cleanupAudio();
    stopCallStreaming();
  }, [currentCall, cleanupAudio, stopCallStreaming]);

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
  ]);

  return {
    isConnected,
    isCallActive,
    isConnecting,
    error,
    hasMicrophoneAccess,
    callControlId,
    makeCall,
    hangupCall,
    sendDTMF,
    debugAudioSetup,
  };
};
