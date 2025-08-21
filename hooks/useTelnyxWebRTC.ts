import { useState, useEffect, useCallback, useRef } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";

interface TelnyxConfig {
  apiKey: string;
  sipUsername: string;
  sipPassword: string;
  phoneNumber: string;
}

export const useTelnyxWebRTC = (config: TelnyxConfig) => {
  const [client, setClient] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMicrophoneAccess, setHasMicrophoneAccess] = useState(false);

  // Refs for audio elements
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Initialize Telnyx client
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
        // Request microphone access first
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
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

        // Set up event listeners
        telnyxClient.on("telnyx.ready", () => {
          console.log("Telnyx client ready");
          setIsConnected(true);
          setError(null);
        });

        telnyxClient.on("telnyx.error", (error: any) => {
          console.error("Telnyx error:", error);
          setError(`Telnyx Error: ${error.message || "Connection error"}`);
          setIsConnected(false);
          setIsConnecting(false);
        });

        telnyxClient.on("telnyx.socket.close", () => {
          console.log("Telnyx connection closed");
          setIsConnected(false);
        });

        // Handle call events
        telnyxClient.on("call.ringing", (call: any) => {
          console.log("Call ringing:", call);
          setIsConnecting(true);
          setIsCallActive(false);
          setCurrentCall(call);
        });

        telnyxClient.on("call.answered", (call: any) => {
          console.log("Call answered:", call);
          setIsConnecting(false);
          setIsCallActive(true);
          setCurrentCall(call);
          setError(null);

          // Handle audio streams when call is answered
          handleCallAnswered(call);
        });

        telnyxClient.on("call.ended", (call: any) => {
          console.log("Call ended:", call);
          setIsCallActive(false);
          setIsConnecting(false);
          setCurrentCall(null);
          cleanupAudio();
        });

        telnyxClient.on("call.updated", (call: any) => {
          console.log("Call updated:", call);
          setCurrentCall(call);
        });

        // Handle call notifications for additional states
        telnyxClient.on("telnyx.notification", (notification: any) => {
          console.log("Telnyx notification:", notification);

          if (notification.type === "callUpdate") {
            const call = notification.call;
            console.log("Call update:", call.state, call);

            switch (call.state) {
              case "ringing":
                setIsConnecting(true);
                setIsCallActive(false);
                setCurrentCall(call);
                break;
              case "active":
                setIsCallActive(true);
                setIsConnecting(false);
                setError(null);
                handleCallAnswered(call);
                break;
              case "hangup":
              case "destroy":
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                cleanupAudio();
                break;
              case "purge":
                console.log("Call purged - call failed");
                setIsCallActive(false);
                setIsConnecting(false);
                setCurrentCall(null);
                setError(
                  "Call failed - Check SIP credentials and outbound voice profile"
                );
                cleanupAudio();
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
                  setError(`Call failed: ${call.state}`);
                  cleanupAudio();
                }
                break;
            }
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
      cleanupAudio();
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

        const call = client.newCall({
          destinationNumber: phoneNumber,
          callerNumber: config.phoneNumber,
        });

        // Set up call event handlers
        call.on("ringing", () => {
          console.log("Call is ringing");
          setIsConnecting(true);
          setIsCallActive(false);
          setCurrentCall(call);
        });

        call.on("answered", () => {
          console.log("Call answered");
          setIsConnecting(false);
          setIsCallActive(true);
          setCurrentCall(call);
          setError(null);
          handleCallAnswered(call);
        });

        call.on("ended", () => {
          console.log("Call ended");
          setIsCallActive(false);
          setIsConnecting(false);
          setCurrentCall(null);
          cleanupAudio();
        });

        call.on("remoteStream", (stream: MediaStream) => {
          console.log("Remote stream received:", stream);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
          }
        });

        setCurrentCall(call);

        // Set a timeout to catch silent failures
        setTimeout(() => {
          if (isConnecting && !isCallActive) {
            console.log("Call timeout - no response after 10 seconds");
            setIsConnecting(false);
            setError("Call timeout - Check your Telnyx configuration");
          }
        }, 10000);
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
    ]
  );

  // Hang up call
  const hangupCall = useCallback(() => {
    if (currentCall) {
      try {
        currentCall.hangup();
      } catch (err) {
        console.error("Failed to hang up call:", err);
      }
    }
    cleanupAudio();
  }, [currentCall, cleanupAudio]);

  // Send DTMF tones during call
  const sendDTMF = useCallback(
    (digit: string) => {
      if (currentCall && isCallActive) {
        try {
          currentCall.dtmf(digit);
        } catch (err) {
          console.error("Failed to send DTMF:", err);
        }
      }
    },
    [currentCall, isCallActive]
  );

  return {
    isConnected,
    isCallActive,
    isConnecting,
    error,
    hasMicrophoneAccess,
    makeCall,
    hangupCall,
    sendDTMF,
  };
};
