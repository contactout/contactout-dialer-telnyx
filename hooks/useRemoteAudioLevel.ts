import { useState, useRef, useEffect } from "react";
import { useSharedAudio } from "./useSharedAudio";

export const useRemoteAudioLevel = (
  currentCall: any,
  isCallActive: boolean
) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const { getAudioContext } = useSharedAudio();

  useEffect(() => {
    if (!isCallActive || !currentCall) {
      setAudioLevel(0);
      setIsSpeaking(false);
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
          return;
        }

        console.log("🎤 Setting up remote audio analysis for visual feedback");

        // Use shared AudioContext to avoid conflicts with call audio
        const audioContext = getAudioContext();
        if (!audioContext) {
          console.warn(
            "⚠️ No audio context available for remote audio analysis"
          );
          return;
        }

        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(remoteStream);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        source.connect(analyser);
        // Note: Audio playback is handled by HTML audio element in CallingScreen
        // This is only for visual feedback (audio bars)

        analyserRef.current = analyser;

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

      // No need to close audio context as it's shared
      analyserRef.current = null;
    };
  }, [isCallActive, currentCall]);

  return { audioLevel, isSpeaking };
};
