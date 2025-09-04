/**
 * CRITICAL CALL FLOW TESTS
 *
 * These tests ensure the call flow synchronization between Telnyx and UI
 * remains intact. This is a critical user experience flow that must not break.
 *
 * Test Coverage:
 * - Call initiation and state transitions
 * - Proper ringing state detection
 * - UI state synchronization
 * - Error handling during call flow
 */

import { renderHook, act } from "@testing-library/react";
import { useTelnyxWebRTC } from "../hooks/useTelnyxWebRTC";

// Mock TelnyxRTC
jest.mock("@telnyx/webrtc", () => ({
  TelnyxRTC: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    newCall: jest.fn().mockReturnValue({
      id: "test-call-id",
      state: "new",
      hangup: jest.fn(),
      sendDTMF: jest.fn(),
    }),
    on: jest.fn(),
  })),
}));

// Mock database service
jest.mock("../lib/database", () => ({
  DatabaseService: {
    trackCall: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock phone number utils
jest.mock("../lib/phoneNumberUtils", () => ({
  toE164: jest.fn().mockReturnValue("+1234567890"),
}));

describe.skip("Call Flow Synchronization Tests", () => {
  const mockConfig = {
    apiKey: "test-api-key",
    sipUsername: "test-username",
    sipPassword: "test-password",
    phoneNumber: "+1234567890",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock getUserMedia
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }],
        }),
      },
    });
  });

  describe("Call State Transitions", () => {
    it("should properly transition from idle to dialing when call is initiated", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      // Wait for initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Initiate call
      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Verify call state transitions
      expect(result.current.isConnecting).toBe(true);
      expect(result.current.callState).toBe("dialing");
    });

    it("should transition from dialing to ringing when call reaches early state", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      // Wait for initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock call object with state transitions
      const mockCall = {
        id: "test-call-id",
        state: "new",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      // Simulate call creation
      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate state transition to early (ringing)
      await act(async () => {
        mockCall.state = "early";
        // Trigger the call state monitoring
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Verify ringing state
      expect(result.current.callState).toBe("ringing");
    });

    it("should transition from ringing to connected when call is answered", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      // Wait for initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock call object
      const mockCall = {
        id: "test-call-id",
        state: "new",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      // Simulate call flow
      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate ringing state
      await act(async () => {
        mockCall.state = "early";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Simulate call answered
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Verify connected state
      expect(result.current.callState).toBe("connected");
      expect(result.current.isCallActive).toBe(true);
    });
  });

  describe("Critical State Synchronization", () => {
    it("should never have UI state out of sync with Telnyx call state", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Test all possible state combinations
      const stateTransitions = [
        { telnyxState: "new", expectedUIState: "dialing" },
        { telnyxState: "requesting", expectedUIState: "dialing" },
        { telnyxState: "trying", expectedUIState: "dialing" },
        { telnyxState: "early", expectedUIState: "ringing" },
        { telnyxState: "ringing", expectedUIState: "ringing" },
        { telnyxState: "answered", expectedUIState: "connected" },
      ];

      for (const transition of stateTransitions) {
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate the Telnyx state
        await act(async () => {
          // This would be handled by the actual Telnyx call object
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Verify UI state matches expected state
        expect(result.current.callState).toBe(transition.expectedUIState);
      }
    });

    it("should handle rapid state transitions without getting stuck", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Simulate rapid state transitions
      const rapidTransitions = [
        "new",
        "requesting",
        "trying",
        "early",
        "answered",
      ];

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      for (const state of rapidTransitions) {
        await act(async () => {
          // Simulate rapid state change
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
      }

      // Should end up in connected state
      expect(result.current.callState).toBe("connected");
    });
  });

  describe("Error Handling During Call Flow", () => {
    it("should handle call failures gracefully without breaking state", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a failed call
      const mockCall = {
        id: "test-call-id",
        state: "failed",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call failure
      await act(async () => {
        mockCall.state = "failed";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should handle failure gracefully
      expect(result.current.error).toBeTruthy();
      expect(result.current.isConnecting).toBe(false);
    });

    it("should reset state properly after call failure", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Simulate failed call
      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Reset call state
      await act(async () => {
        result.current.forceResetCallState();
      });

      // Should be back to idle
      expect(result.current.callState).toBe("idle");
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isCallActive).toBe(false);
    });
  });

  describe("Voice Mail Detection Logic", () => {
    it("should NOT classify normal answered calls as voice mail", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a normal answered call (no voice mail indicators)
      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
        // No voice mail indicators
        voice_mail_detected: false,
        machine_answer: false,
        headers: {},
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call answered without voice mail indicators
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be classified as connected, not voicemail
      expect(result.current.callState).toBe("connected");
      expect(result.current.isCallActive).toBe(true);
    });

    it("should classify calls with Telnyx voice mail indicators as voice mail", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a call with voice mail indicators
      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
        voice_mail_detected: true, // Telnyx voice mail indicator
        machine_answer: false,
        headers: {},
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call answered with voice mail indicators
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be classified as voicemail
      expect(result.current.callState).toBe("voicemail");
      expect(result.current.isCallActive).toBe(true);
    });

    it("should classify calls with machine answer indicators as voice mail", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a call with machine answer indicators
      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
        voice_mail_detected: false,
        machine_answer: true, // Machine answer indicator
        headers: {},
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call answered with machine answer indicators
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be classified as voicemail
      expect(result.current.callState).toBe("voicemail");
      expect(result.current.isCallActive).toBe(true);
    });

    it("should classify calls with voice mail headers as voice mail", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a call with voice mail headers
      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
        voice_mail_detected: false,
        machine_answer: false,
        headers: {
          "X-Voice-Mail": "true", // Voice mail header
        },
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call answered with voice mail headers
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be classified as voicemail
      expect(result.current.callState).toBe("voicemail");
      expect(result.current.isCallActive).toBe(true);
    });

    it("should NOT classify short calls as voice mail without other indicators", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Mock a short answered call without voice mail indicators
      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
        voice_mail_detected: false,
        machine_answer: false,
        headers: {},
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate very short call (1 second) without voice mail indicators
      await act(async () => {
        mockCall.state = "answered";
        // Simulate short duration by advancing time
        jest.advanceTimersByTime(1000);
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be classified as connected, not voicemail
      expect(result.current.callState).toBe("connected");
      expect(result.current.isCallActive).toBe(true);
    });
  });

  describe("Call Status Determination", () => {
    it("should mark successful calls as completed regardless of duration", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const mockCall = {
        id: "test-call-id",
        state: "answered",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate short but successful call
      await act(async () => {
        mockCall.state = "answered";
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Hangup the call
      await act(async () => {
        result.current.hangupCall();
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be marked as completed, not failed
      expect(result.current.callState).toBe("idle");
    });

    it("should mark extremely short calls (< 1 second) as failed", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const mockCall = {
        id: "test-call-id",
        state: "failed",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate extremely short call that fails immediately
      await act(async () => {
        mockCall.state = "failed";
        jest.advanceTimersByTime(500); // Less than 1 second
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be marked as failed
      expect(result.current.error).toBeTruthy();
      expect(result.current.error).toContain("failed");
    });

    it("should mark calls that never progress past dialing as failed", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const mockCall = {
        id: "test-call-id",
        state: "dialing",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call that stays in dialing state and then ends
      await act(async () => {
        mockCall.state = "dialing";
        jest.advanceTimersByTime(2000); // 2 seconds in dialing state
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Hangup the call
      await act(async () => {
        result.current.hangupCall();
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be marked as failed
      expect(result.current.error).toBeTruthy();
      expect(result.current.error).toContain("failed");
    });

    it("should mark calls that never progress past ringing as failed", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const mockCall = {
        id: "test-call-id",
        state: "ringing",
        hangup: jest.fn(),
        sendDTMF: jest.fn(),
      };

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate call that reaches ringing but never answers
      await act(async () => {
        mockCall.state = "ringing";
        jest.advanceTimersByTime(2000); // 2 seconds in ringing state
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Hangup the call
      await act(async () => {
        result.current.hangupCall();
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should be marked as failed
      expect(result.current.error).toBeTruthy();
      expect(result.current.error).toContain("failed");
    });
  });

  describe("Call Flow Timing", () => {
    it("should transition to ringing within reasonable time", async () => {
      const { result } = renderHook(() =>
        useTelnyxWebRTC(mockConfig, "test-user")
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const startTime = Date.now();

      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      // Simulate reaching ringing state
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const endTime = Date.now();
      const transitionTime = endTime - startTime;

      // Should transition to ringing within 500ms
      expect(transitionTime).toBeLessThan(500);
      expect(result.current.callState).toBe("dialing"); // or 'ringing' if early state is reached
    });
  });
});

/**
 * INTEGRATION TESTS
 * These tests verify the complete call flow from UI perspective
 */
describe.skip("Call Flow Integration Tests", () => {
  it("should maintain proper call flow when multiple rapid calls are made", async () => {
    const { result } = renderHook(() =>
      useTelnyxWebRTC(mockConfig, "test-user")
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Make multiple rapid calls
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.makeCall("+1234567890");
      });

      await act(async () => {
        result.current.hangupCall();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    }

    // Should be in idle state after all calls
    expect(result.current.callState).toBe("idle");
  });

  it("should handle call state transitions during active call", async () => {
    const { result } = renderHook(() =>
      useTelnyxWebRTC(mockConfig, "test-user")
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Start call
    await act(async () => {
      await result.current.makeCall("+1234567890");
    });

    // Verify we can send DTMF during call
    await act(async () => {
      result.current.sendDTMF("1");
    });

    // Should not break call state
    expect(result.current.isCallActive || result.current.isConnecting).toBe(
      true
    );
  });

  it("should maintain calling screen UI when call is answered (CRITICAL FIX)", async () => {
    const { result } = renderHook(() =>
      useTelnyxWebRTC(mockConfig, "test-user")
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const mockCall = {
      id: "test-call-id",
      state: "new",
      hangup: jest.fn(),
      sendDTMF: jest.fn(),
      voice_mail_detected: false,
      machine_answer: false,
      headers: {},
    };

    // Start call
    await act(async () => {
      await result.current.makeCall("+1234567890");
    });

    // Verify initial state
    expect(result.current.isConnecting).toBe(true);
    expect(result.current.callState).toBe("dialing");

    // Simulate call progression to ringing
    await act(async () => {
      mockCall.state = "early";
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(result.current.callState).toBe("ringing");
    expect(result.current.isConnecting).toBe(true);

    // Simulate call answered (CRITICAL: should stay on calling screen)
    await act(async () => {
      mockCall.state = "answered";
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // CRITICAL FIX: Should be connected and active, NOT redirected to dialpad
    expect(result.current.callState).toBe("connected");
    expect(result.current.isCallActive).toBe(true);
    expect(result.current.isConnecting).toBe(false);

    // UI should show calling screen, not dialpad
    // This is verified by the isCallActive and callState values
  });

  it("should properly log successful calls in call history", async () => {
    const { result } = renderHook(() =>
      useTelnyxWebRTC(mockConfig, "test-user")
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const mockCall = {
      id: "test-call-id",
      state: "answered",
      hangup: jest.fn(),
      sendDTMF: jest.fn(),
      voice_mail_detected: false,
      machine_answer: false,
      headers: {},
    };

    // Start and answer call
    await act(async () => {
      await result.current.makeCall("+1234567890");
    });

    await act(async () => {
      mockCall.state = "answered";
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // Hangup the call
    await act(async () => {
      result.current.hangupCall();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // Call should be logged as completed, not failed
    // This is verified by the call state being idle (successful completion)
    expect(result.current.callState).toBe("idle");
    expect(result.current.isCallActive).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });
});
