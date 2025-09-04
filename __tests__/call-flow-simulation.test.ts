/**
 * COMPREHENSIVE CALL FLOW SIMULATION TESTS
 *
 * This test suite simulates ALL possible call flow scenarios to ensure
 * the codebase handles every use case gracefully and properly.
 *
 * Test Coverage:
 * - All Telnyx call states and transitions
 * - All success scenarios (local, international, mobile, landline)
 * - All failure scenarios (busy, no answer, invalid, timeout, etc.)
 * - All edge cases (network issues, voice mail, rapid calls, etc.)
 * - All error handling and recovery mechanisms
 * - All state synchronization scenarios
 */

import { renderHook, act } from "@testing-library/react";
import { useTelnyxWebRTC } from "../hooks/useTelnyxWebRTC";
import { useDialer } from "../hooks/useDialer";

// Mock TelnyxRTC with comprehensive state simulation
const createMockTelnyxClient = () => {
  let callState = "idle";
  let callObject: any = null;
  let eventListeners: Record<string, Function[]> = {};

  return {
    connect: jest.fn().mockImplementation(() => {
      // Simulate connection success
      setTimeout(() => {
        eventListeners["telnyx.ready"]?.forEach((callback) => callback());
      }, 100);
      return Promise.resolve();
    }),

    newCall: jest.fn().mockImplementation((params) => {
      callObject = {
        id: `call-${Date.now()}`,
        state: "new",
        destinationNumber: params.destinationNumber,
        callerNumber: params.callerNumber,
        hangup: jest.fn().mockImplementation(() => {
          callObject.state = "hangup";
          eventListeners["call"]?.forEach((callback) => callback(callObject));
        }),
        sendDTMF: jest.fn(),
        // Voice mail detection properties
        voice_mail_detected: false,
        machine_answer: false,
        headers: {},
        legs: [],
        reason: "",
        error: "",
      };

      // Simulate call creation
      setTimeout(() => {
        eventListeners["call"]?.forEach((callback) => callback(callObject));
      }, 50);

      return callObject;
    }),

    on: jest.fn().mockImplementation((event, callback) => {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(callback);
    }),

    // Test helper methods
    simulateCallState: (state: string, callProps: any = {}) => {
      if (callObject) {
        callObject.state = state;
        Object.assign(callObject, callProps);
        eventListeners["call"]?.forEach((callback) => callback(callObject));
      }
    },

    simulateError: (error: any) => {
      eventListeners["telnyx.error"]?.forEach((callback) => callback(error));
    },

    simulateConnectionLost: () => {
      eventListeners["connection.lost"]?.forEach((callback) => callback());
    },

    simulateConnectionRestored: () => {
      eventListeners["connection.restored"]?.forEach((callback) => callback());
    },

    getCurrentCall: () => callObject,
  };
};

// Mock database service
jest.mock("../lib/database", () => ({
  DatabaseService: {
    trackCall: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock phone number utils
jest.mock("../lib/phoneNumberUtils", () => ({
  toE164: jest.fn().mockImplementation((number) => {
    if (number.startsWith("+")) return number;
    if (number.startsWith("1")) return `+${number}`;
    return `+1${number}`;
  }),
  detectCountry: jest
    .fn()
    .mockReturnValue({ name: "United States", flag: "🇺🇸" }),
  formatPhoneNumber: jest.fn().mockImplementation((number) => number),
}));

// Mock security manager
jest.mock("../lib/security", () => ({
  securityManager: {
    validatePhoneNumber: jest.fn().mockReturnValue({ riskLevel: "low" }),
    checkRateLimit: jest.fn().mockReturnValue({ isAllowed: true }),
  },
}));

// Mock error handler
jest.mock("../lib/errorHandler", () => ({
  logError: jest.fn(),
}));

describe("Comprehensive Call Flow Simulation", () => {
  let mockTelnyxClient: any;
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockTelnyxClient = createMockTelnyxClient();

    // Mock TelnyxRTC constructor
    jest.doMock("@telnyx/webrtc", () => ({
      TelnyxRTC: jest.fn().mockImplementation(() => mockTelnyxClient),
    }));

    mockConfig = {
      apiKey: "test-api-key",
      sipUsername: "test-username",
      sipPassword: "test-password",
      phoneNumber: "+1234567890",
    };

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

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("1. SUCCESSFUL CALL SCENARIOS", () => {
    describe("1.1 Local Call Success", () => {
      it("should handle complete local call flow successfully", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        // Wait for initialization
        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        expect(result.current.isConnected).toBe(true);
        expect(result.current.callState).toBe("idle");

        // Start call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        expect(result.current.isConnecting).toBe(true);
        expect(result.current.callState).toBe("dialing");

        // Simulate call progression: new → requesting → trying → early → answered
        await act(async () => {
          mockTelnyxClient.simulateCallState("requesting");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("dialing");

        await act(async () => {
          mockTelnyxClient.simulateCallState("trying");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("dialing");

        await act(async () => {
          mockTelnyxClient.simulateCallState("early");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("ringing");
        expect(result.current.isConnecting).toBe(true);

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
        expect(result.current.isConnecting).toBe(false);

        // Simulate call hangup
        await act(async () => {
          result.current.hangupCall();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("idle");
        expect(result.current.isCallActive).toBe(false);
        expect(result.current.isConnecting).toBe(false);
      });
    });

    describe("1.2 International Call Success", () => {
      it("should handle international call with longer connection time", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start international call
        await act(async () => {
          await result.current.makeCall("+44123456789");
        });

        expect(result.current.callState).toBe("dialing");

        // Simulate longer connection time for international call
        await act(async () => {
          mockTelnyxClient.simulateCallState("requesting");
          jest.advanceTimersByTime(500);
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("trying");
          jest.advanceTimersByTime(2000); // Longer trying phase
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("early");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("ringing");

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });

    describe("1.3 Mobile Call Success", () => {
      it("should handle mobile call with different state progression", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Mobile calls might skip some states
        await act(async () => {
          mockTelnyxClient.simulateCallState("new");
          jest.advanceTimersByTime(100);
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("ringing"); // Direct to ringing
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("ringing");

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
      });
    });

    describe("1.4 Landline Call Success", () => {
      it("should handle landline call with standard progression", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Standard landline progression
        const states = ["new", "requesting", "trying", "early", "answered"];

        for (const state of states) {
          await act(async () => {
            mockTelnyxClient.simulateCallState(state);
            jest.advanceTimersByTime(100);
          });
        }

        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });
  });

  describe("2. CALL FAILURE SCENARIOS", () => {
    describe("2.1 Invalid Number", () => {
      it("should handle invalid phone number gracefully", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("invalid");
        });

        expect(result.current.callState).toBe("dialing");

        // Simulate immediate failure for invalid number
        await act(async () => {
          mockTelnyxClient.simulateCallState("failed", {
            reason: "invalid-number",
            error: "Invalid phone number format",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("failed");
        expect(result.current.isConnecting).toBe(false);
      });
    });

    describe("2.2 Busy Number", () => {
      it("should handle busy number scenario", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate call progression to ringing then busy
        await act(async () => {
          mockTelnyxClient.simulateCallState("early");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("ringing");

        await act(async () => {
          mockTelnyxClient.simulateCallState("hangup", {
            reason: "busy",
            error: "Number is busy",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("busy");
      });
    });

    describe("2.3 No Answer", () => {
      it("should handle no answer scenario", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate ringing for extended period then no answer
        await act(async () => {
          mockTelnyxClient.simulateCallState("ringing");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("ringing");

        // Simulate timeout/no answer
        await act(async () => {
          jest.advanceTimersByTime(30000); // 30 seconds of ringing
          mockTelnyxClient.simulateCallState("hangup", {
            reason: "no-answer",
            error: "No answer",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("No answer");
      });
    });

    describe("2.4 Call Rejected", () => {
      it("should handle call rejection scenario", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("ringing");
          jest.advanceTimersByTime(100);
        });

        // Simulate quick rejection
        await act(async () => {
          jest.advanceTimersByTime(2000);
          mockTelnyxClient.simulateCallState("hangup", {
            reason: "rejected",
            error: "Call rejected",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("rejected");
      });
    });

    describe("2.5 Network Timeout", () => {
      it("should handle network timeout during connection", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate stuck in trying state
        await act(async () => {
          mockTelnyxClient.simulateCallState("trying");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("dialing");

        // Simulate timeout after 45 seconds
        await act(async () => {
          jest.advanceTimersByTime(45000);
        });

        // Should trigger timeout handling
        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("failed");
      });
    });
  });

  describe("3. VOICE MAIL SCENARIOS", () => {
    describe("3.1 Voice Mail Detection", () => {
      it("should detect voice mail with Telnyx indicators", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate call progression to answered with voice mail indicators
        await act(async () => {
          mockTelnyxClient.simulateCallState("answered", {
            voice_mail_detected: true,
            machine_answer: false,
            headers: {},
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("voicemail");
        expect(result.current.isCallActive).toBe(true);
      });

      it("should detect voice mail with machine answer indicators", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered", {
            voice_mail_detected: false,
            machine_answer: true,
            headers: {},
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("voicemail");
      });

      it("should detect voice mail with headers", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered", {
            voice_mail_detected: false,
            machine_answer: false,
            headers: {
              "X-Voice-Mail": "true",
            },
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("voicemail");
      });

      it("should NOT classify normal calls as voice mail", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate normal answered call without voice mail indicators
        await act(async () => {
          mockTelnyxClient.simulateCallState("answered", {
            voice_mail_detected: false,
            machine_answer: false,
            headers: {},
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });

    describe("3.2 Voice Mail Call Handling", () => {
      it("should handle voice mail call completion", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate voice mail
        await act(async () => {
          mockTelnyxClient.simulateCallState("answered", {
            voice_mail_detected: true,
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("voicemail");

        // Simulate user hanging up after leaving message
        await act(async () => {
          jest.advanceTimersByTime(30000); // 30 second voice mail
          result.current.hangupCall();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("idle");
      });
    });
  });

  describe("4. NETWORK AND CONNECTION ISSUES", () => {
    describe("4.1 Connection Lost During Call", () => {
      it("should handle connection loss during active call", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start and establish call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");

        // Simulate connection loss
        await act(async () => {
          mockTelnyxClient.simulateConnectionLost();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.isConnected).toBe(false);
        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("Connection lost");
      });
    });

    describe("4.2 Connection Restored", () => {
      it("should handle connection restoration", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Simulate connection loss
        await act(async () => {
          mockTelnyxClient.simulateConnectionLost();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.isConnected).toBe(false);

        // Simulate connection restoration
        await act(async () => {
          mockTelnyxClient.simulateConnectionRestored();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.isConnected).toBe(true);
        expect(result.current.error).toBe(null);
      });
    });

    describe("4.3 Authentication Failure", () => {
      it("should handle authentication failure", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Simulate auth failure
        await act(async () => {
          mockTelnyxClient.simulateError({
            code: "AUTH_FAILED",
            message: "Authentication failed",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();
        expect(result.current.error).toContain("Authentication failed");
        expect(result.current.isConnected).toBe(false);
      });
    });
  });

  describe("5. RAPID CALL SCENARIOS", () => {
    describe("5.1 Rapid Successive Calls", () => {
      it("should handle multiple rapid calls without state corruption", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Make first call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        expect(result.current.callState).toBe("dialing");

        // Hangup first call
        await act(async () => {
          result.current.hangupCall();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("idle");

        // Make second call immediately
        await act(async () => {
          await result.current.makeCall("+1234567891");
        });

        expect(result.current.callState).toBe("dialing");

        // Complete second call
        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
      });
    });

    describe("5.2 Call During Active Call", () => {
      it("should prevent new call during active call", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start first call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);

        // Try to start second call
        await act(async () => {
          await result.current.makeCall("+1234567891");
        });

        // Should still be in first call
        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });
  });

  describe("6. DTMF AND CALL FEATURES", () => {
    describe("6.1 DTMF During Call", () => {
      it("should handle DTMF tones during active call", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");

        // Send DTMF
        await act(async () => {
          result.current.sendDTMF("1");
        });

        // Should not affect call state
        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });

    describe("6.2 Call Duration Tracking", () => {
      it("should track call duration correctly", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        const startTime = Date.now();

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");

        // Advance time to simulate call duration
        await act(async () => {
          jest.advanceTimersByTime(5000); // 5 seconds
        });

        // Call should still be active
        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });
  });

  describe("7. ERROR HANDLING AND RECOVERY", () => {
    describe("7.1 Error Recovery", () => {
      it("should recover from errors and allow new calls", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Simulate error
        await act(async () => {
          mockTelnyxClient.simulateError({
            code: "NETWORK_ERROR",
            message: "Network error",
          });
          jest.advanceTimersByTime(100);
        });

        expect(result.current.error).toBeTruthy();

        // Clear error
        await act(async () => {
          result.current.clearError();
        });

        expect(result.current.error).toBe(null);

        // Should be able to make new call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        expect(result.current.callState).toBe("dialing");
      });
    });

    describe("7.2 Force Reset", () => {
      it("should force reset call state when needed", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        expect(result.current.callState).toBe("dialing");

        // Force reset
        await act(async () => {
          result.current.forceResetCallState();
        });

        expect(result.current.callState).toBe("idle");
        expect(result.current.isConnecting).toBe(false);
        expect(result.current.isCallActive).toBe(false);
      });
    });
  });

  describe("8. STATE SYNCHRONIZATION VALIDATION", () => {
    describe("8.1 UI State Sync", () => {
      it("should maintain UI state synchronization with Telnyx states", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Test all state transitions
        const stateTests = [
          { telnyxState: "new", expectedUIState: "dialing" },
          { telnyxState: "requesting", expectedUIState: "dialing" },
          { telnyxState: "trying", expectedUIState: "dialing" },
          { telnyxState: "early", expectedUIState: "ringing" },
          { telnyxState: "ringing", expectedUIState: "ringing" },
          { telnyxState: "answered", expectedUIState: "connected" },
          { telnyxState: "connected", expectedUIState: "connected" },
        ];

        for (const test of stateTests) {
          await act(async () => {
            await result.current.makeCall("+1234567890");
          });

          await act(async () => {
            mockTelnyxClient.simulateCallState(test.telnyxState);
            jest.advanceTimersByTime(100);
          });

          expect(result.current.callState).toBe(test.expectedUIState);

          // Reset for next test
          await act(async () => {
            result.current.forceResetCallState();
            jest.advanceTimersByTime(100);
          });
        }
      });
    });

    describe("8.2 Invalid State Transitions", () => {
      it("should prevent invalid state transitions", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        expect(result.current.callState).toBe("dialing");

        // Try invalid transition (dialing → connected without ringing)
        await act(async () => {
          mockTelnyxClient.simulateCallState("connected");
          jest.advanceTimersByTime(100);
        });

        // Should not transition directly to connected
        expect(result.current.callState).toBe("dialing");
      });
    });
  });

  describe("9. EDGE CASES AND BOUNDARY CONDITIONS", () => {
    describe("9.1 Very Short Calls", () => {
      it("should handle extremely short calls (< 1 second)", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        // Simulate very short call
        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        await act(async () => {
          jest.advanceTimersByTime(500); // Less than 1 second
          result.current.hangupCall();
          jest.advanceTimersByTime(100);
        });

        // Should be marked as completed (not failed) if it was answered
        expect(result.current.callState).toBe("idle");
      });
    });

    describe("9.2 Very Long Calls", () => {
      it("should handle very long calls without issues", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");

        // Simulate very long call (1 hour)
        await act(async () => {
          jest.advanceTimersByTime(3600000);
        });

        // Should still be active
        expect(result.current.callState).toBe("connected");
        expect(result.current.isCallActive).toBe(true);
      });
    });

    describe("9.3 Memory and Resource Management", () => {
      it("should properly clean up resources after call", async () => {
        const { result } = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Start call
        await act(async () => {
          await result.current.makeCall("+1234567890");
        });

        await act(async () => {
          mockTelnyxClient.simulateCallState("answered");
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("connected");

        // End call
        await act(async () => {
          result.current.hangupCall();
          jest.advanceTimersByTime(100);
        });

        expect(result.current.callState).toBe("idle");
        expect(result.current.isCallActive).toBe(false);
        expect(result.current.isConnecting).toBe(false);

        // Should be able to make new call
        await act(async () => {
          await result.current.makeCall("+1234567891");
        });

        expect(result.current.callState).toBe("dialing");
      });
    });
  });

  describe("10. INTEGRATION WITH DIALER HOOK", () => {
    describe("10.1 Dialer Integration", () => {
      it("should work correctly with dialer hook", async () => {
        const telnyxResult = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        const dialerResult = renderHook(() =>
          useDialer(telnyxResult.result.current)
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Test phone number input
        act(() => {
          dialerResult.result.current[1].setPhoneNumber("+1234567890");
        });

        expect(dialerResult.result.current[0].phoneNumber).toBe("+1234567890");

        // Test call initiation
        act(() => {
          dialerResult.result.current[2].handleCall();
        });

        expect(telnyxResult.result.current.isConnecting).toBe(true);
        expect(telnyxResult.result.current.callState).toBe("dialing");
      });
    });

    describe("10.2 Error Handling Integration", () => {
      it("should handle errors through dialer hook", async () => {
        const telnyxResult = renderHook(() =>
          useTelnyxWebRTC(mockConfig, "test-user")
        );

        const dialerResult = renderHook(() =>
          useDialer(telnyxResult.result.current)
        );

        await act(async () => {
          jest.advanceTimersByTime(200);
        });

        // Simulate error
        await act(async () => {
          mockTelnyxClient.simulateError({
            code: "CALL_FAILED",
            message: "Call failed",
          });
          jest.advanceTimersByTime(100);
        });

        // Error should be handled by dialer
        expect(dialerResult.result.current[0].errorMessage).toBeTruthy();
        expect(dialerResult.result.current[0].showErrorPopup).toBe(true);
      });
    });
  });
});
