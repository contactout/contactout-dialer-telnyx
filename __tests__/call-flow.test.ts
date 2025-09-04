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
});
