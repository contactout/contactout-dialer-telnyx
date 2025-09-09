import { useState, useRef, useEffect } from "react";

export const useRemoteAudioLevel = (
  currentCall: any,
  isCallActive: boolean
) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isCallActive || !currentCall) {
      setAudioLevel(0);
      setIsSpeaking(false);
      return;
    }

    // Prevent multiple setups for the same call
    if (audioContextRef.current) {
      console.log("🎵 Audio context already exists, skipping setup");
      return;
    }

    const setupAudioAnalysis = async () => {
      try {
        // Access remote audio stream from Telnyx call
        // Try different possible ways to get the remote stream
        let remoteStream = null;

        if (currentCall.remoteStream) {
          remoteStream = currentCall.remoteStream;
        } else if (
          currentCall.getRemoteStream &&
          typeof currentCall.getRemoteStream === "function"
        ) {
          remoteStream = currentCall.getRemoteStream();
        } else if (currentCall.remoteMediaStream) {
          remoteStream = currentCall.remoteMediaStream;
        } else if (currentCall.remoteAudioStream) {
          remoteStream = currentCall.remoteAudioStream;
        }

        if (!remoteStream) {
          console.log(
            "🔍 No remote stream found in call object:",
            Object.keys(currentCall)
          );
          // Try to wait a bit and check again, as the stream might not be ready yet
          setTimeout(() => {
            console.log("🔄 Retrying remote stream access...");
            setupAudioAnalysis();
          }, 1000);
          return;
        }

        console.log("🎤 Setting up remote audio analysis and playback");

        // Set up audio analysis and playback (reuse AudioTest pattern)
        const audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();

        // Ensure audio context is running for playback
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("🎵 Audio context resumed for remote audio playback");
          } catch (error) {
            console.warn("⚠️ Failed to resume audio context:", error);
          }
        }

        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(remoteStream);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        source.connect(analyser);
        // CRITICAL FIX: Connect remote audio to browser output for playback
        source.connect(audioContext.destination);

        console.log("✅ Remote audio stream connected to browser output");
        console.log("🎵 Audio context state:", audioContext.state);
        console.log("🔊 Remote stream active:", remoteStream.active);
        console.log("🎤 Audio tracks:", remoteStream.getAudioTracks().length);

        analyserRef.current = analyser;
        audioContextRef.current = audioContext;

        const updateAudioLevel = () => {
          if (!analyserRef.current) return;

          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / bufferLength;
          setAudioLevel(average);

          // Simple threshold for speech detection (adjust as needed)
          const isCurrentlySpeaking = average > 10;
          setIsSpeaking(isCurrentlySpeaking);

          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        };

        updateAudioLevel();
      } catch (error) {
        console.error("❌ Error setting up remote audio analysis:", error);
      }
    };

    setupAudioAnalysis();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (error) {
          console.error("Error closing audio context:", error);
        }
        audioContextRef.current = null;
      }

      analyserRef.current = null;
    };
  }, [isCallActive, currentCall]);

  return { audioLevel, isSpeaking };
};
