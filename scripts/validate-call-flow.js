#!/usr/bin/env node

/**
 * CALL FLOW VALIDATION SCRIPT
 *
 * This script validates that all call flow scenarios work correctly
 * by simulating various Telnyx states and verifying UI responses.
 *
 * Usage: node scripts/validate-call-flow.js
 */

// Import validation functions (simplified for Node.js compatibility)
const validateCallFlowSequence = (telnyxState, currentUIState) => {
  const telnyxToUIStateMap = {
    new: "dialing",
    requesting: "dialing",
    trying: "dialing",
    early: "ringing",
    ringing: "ringing",
    answered: "connected",
    connected: "connected",
    hangup: "ended",
    destroy: "ended",
    failed: "ended",
  };

  const expectedUIState = telnyxToUIStateMap[telnyxState];

  if (!expectedUIState) {
    return {
      shouldTransition: false,
      targetState: null,
      reason: `Unknown Telnyx state: ${telnyxState}`,
    };
  }

  if (currentUIState !== expectedUIState) {
    return {
      shouldTransition: true,
      targetState: expectedUIState,
      reason: `UI state (${currentUIState}) doesn't match expected state (${expectedUIState}) for Telnyx state (${telnyxState})`,
    };
  }

  return {
    shouldTransition: false,
    targetState: null,
    reason: `UI state already correct for Telnyx state ${telnyxState}`,
  };
};

const validateCallStateTransition = (fromState, toState) => {
  const validTransitions = {
    idle: ["dialing"],
    dialing: ["ringing", "ended", "idle"],
    ringing: ["connected", "voicemail", "ended", "idle"],
    connected: ["ended", "idle"],
    voicemail: ["ended", "idle"],
    ended: ["idle", "ringing"],
  };

  const isValid = validTransitions[fromState]?.includes(toState) ?? false;

  return {
    from: fromState,
    to: toState,
    isValid,
    reason: isValid
      ? undefined
      : `Invalid transition from ${fromState} to ${toState}`,
  };
};

const getCallFlowHealth = (
  telnyxState,
  currentUIState,
  isConnecting,
  isCallActive,
  callDuration
) => {
  const issues = [];
  let score = 100;

  // Check state consistency
  if (telnyxState === "early" && currentUIState === "idle") {
    issues.push("CRITICAL: Telnyx is ringing but UI is idle");
    score -= 50;
  }

  if (telnyxState === "trying" && currentUIState === "idle") {
    issues.push("CRITICAL: Telnyx is trying to connect but UI is idle");
    score -= 50;
  }

  if (isConnecting && currentUIState === "idle") {
    issues.push("CRITICAL: isConnecting is true but UI state is idle");
    score -= 30;
  }

  if (isCallActive && !["connected", "voicemail"].includes(currentUIState)) {
    issues.push(
      "CRITICAL: isCallActive is true but UI state is not connected/voicemail"
    );
    score -= 30;
  }

  if (currentUIState === "dialing" && telnyxState === "early") {
    issues.push("CRITICAL: UI stuck in dialing while Telnyx is ringing");
    score -= 50;
  }

  // Check for stuck states
  if (callDuration > 30 && currentUIState === "dialing") {
    issues.push("Call stuck in dialing state for too long");
    score -= 30;
  }

  if (callDuration > 60 && currentUIState === "ringing") {
    issues.push("Call stuck in ringing state for too long");
    score -= 20;
  }

  return {
    isHealthy: score >= 80,
    score: Math.max(0, score),
    issues,
    recommendations: issues.length > 0 ? ["Review call flow logic"] : [],
  };
};

// Test scenarios
const testScenarios = [
  // SUCCESSFUL CALL SCENARIOS
  {
    name: "Local Call Success",
    description: "Complete local call flow from dialing to connected",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 5,
    shouldSucceed: true,
  },
  {
    name: "International Call Success",
    description: "International call with longer connection time",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 15,
    shouldSucceed: true,
  },
  {
    name: "Mobile Call Success",
    description: "Mobile call with direct ringing",
    telnyxStates: ["new", "ringing", "answered"],
    expectedUIStates: ["dialing", "ringing", "connected"],
    callDuration: 3,
    shouldSucceed: true,
  },
  {
    name: "Landline Call Success",
    description: "Standard landline call progression",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 8,
    shouldSucceed: true,
  },

  // FAILURE SCENARIOS
  {
    name: "Invalid Number",
    description: "Call to invalid phone number",
    telnyxStates: ["new", "failed"],
    expectedUIStates: ["dialing", "ended"],
    callDuration: 1,
    shouldSucceed: false,
    errorExpected: true,
  },
  {
    name: "Busy Number",
    description: "Call to busy number",
    telnyxStates: ["new", "requesting", "trying", "early", "hangup"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "ended"],
    callDuration: 3,
    shouldSucceed: false,
    errorExpected: true,
    hangupReason: "busy",
  },
  {
    name: "No Answer",
    description: "Call with no answer",
    telnyxStates: ["new", "requesting", "trying", "early", "ringing", "hangup"],
    expectedUIStates: [
      "dialing",
      "dialing",
      "dialing",
      "ringing",
      "ringing",
      "ended",
    ],
    callDuration: 30,
    shouldSucceed: false,
    errorExpected: true,
    hangupReason: "no-answer",
  },
  {
    name: "Call Rejected",
    description: "Call rejected by recipient",
    telnyxStates: ["new", "requesting", "trying", "early", "hangup"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "ended"],
    callDuration: 2,
    shouldSucceed: false,
    errorExpected: true,
    hangupReason: "rejected",
  },
  {
    name: "Network Timeout",
    description: "Call timeout during connection",
    telnyxStates: ["new", "requesting", "trying"],
    expectedUIStates: ["dialing", "dialing", "dialing"],
    callDuration: 45,
    shouldSucceed: false,
    errorExpected: true,
    timeoutExpected: true,
  },

  // VOICE MAIL SCENARIOS
  {
    name: "Voice Mail - Telnyx Indicator",
    description: "Voice mail detected by Telnyx",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "voicemail"],
    callDuration: 5,
    shouldSucceed: true,
    voiceMailIndicators: { voice_mail_detected: true },
  },
  {
    name: "Voice Mail - Machine Answer",
    description: "Voice mail detected by machine answer",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "voicemail"],
    callDuration: 5,
    shouldSucceed: true,
    voiceMailIndicators: { machine_answer: true },
  },
  {
    name: "Voice Mail - Headers",
    description: "Voice mail detected by headers",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "voicemail"],
    callDuration: 5,
    shouldSucceed: true,
    voiceMailIndicators: { headers: { "X-Voice-Mail": "true" } },
  },
  {
    name: "Normal Call (Not Voice Mail)",
    description: "Normal answered call without voice mail indicators",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 5,
    shouldSucceed: true,
    voiceMailIndicators: {
      voice_mail_detected: false,
      machine_answer: false,
      headers: {},
    },
  },

  // EDGE CASES
  {
    name: "Very Short Call",
    description: "Extremely short call (< 1 second)",
    telnyxStates: ["new", "answered", "hangup"],
    expectedUIStates: ["dialing", "connected", "ended"],
    callDuration: 0.5,
    shouldSucceed: true,
  },
  {
    name: "Very Long Call",
    description: "Very long call (1 hour)",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 3600,
    shouldSucceed: true,
  },
  {
    name: "Rapid State Changes",
    description: "Rapid state transitions",
    telnyxStates: ["new", "requesting", "trying", "early", "answered"],
    expectedUIStates: ["dialing", "dialing", "dialing", "ringing", "connected"],
    callDuration: 1,
    shouldSucceed: true,
    rapidTransitions: true,
  },
];

// Validation functions
function validateStateTransition(fromState, toState) {
  const validation = validateCallStateTransition(fromState, toState);
  return {
    isValid: validation.isValid,
    reason: validation.reason,
  };
}

function validateCallFlow(telnyxState, currentUIState) {
  const validation = validateCallFlowSequence(telnyxState, currentUIState);
  return {
    shouldTransition: validation.shouldTransition,
    targetState: validation.targetState,
    reason: validation.reason,
  };
}

function getHealthScore(
  telnyxState,
  uiState,
  isConnecting,
  isCallActive,
  duration
) {
  return getCallFlowHealth(
    telnyxState,
    uiState,
    isConnecting,
    isCallActive,
    duration
  );
}

// Test runner
function runValidation() {
  console.log("🚀 Starting Call Flow Validation...\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const results = [];

  for (const scenario of testScenarios) {
    console.log(`📞 Testing: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);

    totalTests++;
    let scenarioPassed = true;
    const errors = [];

    // Simulate the call flow
    let currentUIState = "idle";
    let isConnecting = false;
    let isCallActive = false;

    for (let i = 0; i < scenario.telnyxStates.length; i++) {
      const telnyxState = scenario.telnyxStates[i];
      const expectedUIState = scenario.expectedUIStates[i];

      // Update connection states based on UI state
      if (expectedUIState === "dialing" || expectedUIState === "ringing") {
        isConnecting = true;
        isCallActive = false;
      } else if (
        expectedUIState === "connected" ||
        expectedUIState === "voicemail"
      ) {
        isConnecting = false;
        isCallActive = true;
      } else if (expectedUIState === "ended" || expectedUIState === "idle") {
        isConnecting = false;
        isCallActive = false;
      }

      // Validate call flow sequence
      const flowValidation = validateCallFlow(telnyxState, currentUIState);

      if (flowValidation.shouldTransition) {
        // Validate state transition
        const transitionValidation = validateStateTransition(
          currentUIState,
          flowValidation.targetState
        );

        if (transitionValidation.isValid) {
          currentUIState = flowValidation.targetState;
        } else {
          errors.push(`Invalid transition: ${transitionValidation.reason}`);
          scenarioPassed = false;
        }
      }

      // Check if UI state matches expected
      if (currentUIState !== expectedUIState) {
        errors.push(
          `State mismatch: Expected ${expectedUIState}, got ${currentUIState} for Telnyx state ${telnyxState}`
        );
        scenarioPassed = false;
      }

      // Get health score
      const health = getHealthScore(
        telnyxState,
        currentUIState,
        isConnecting,
        isCallActive,
        scenario.callDuration
      );

      if (health.score < 80) {
        errors.push(
          `Low health score: ${health.score} - ${health.issues.join(", ")}`
        );
        scenarioPassed = false;
      }
    }

    // Final state validation
    if (scenario.shouldSucceed) {
      if (currentUIState !== "connected" && currentUIState !== "voicemail") {
        errors.push(`Expected successful call but ended in ${currentUIState}`);
        scenarioPassed = false;
      }
    } else {
      if (currentUIState !== "ended" && currentUIState !== "idle") {
        errors.push(`Expected failed call but ended in ${currentUIState}`);
        scenarioPassed = false;
      }
    }

    // Record results
    const result = {
      name: scenario.name,
      passed: scenarioPassed,
      errors: errors,
      finalState: currentUIState,
      health: getHealthScore(
        scenario.telnyxStates[scenario.telnyxStates.length - 1],
        currentUIState,
        isConnecting,
        isCallActive,
        scenario.callDuration
      ),
    };

    results.push(result);

    if (scenarioPassed) {
      console.log(
        `   ✅ PASSED - Final state: ${currentUIState}, Health: ${result.health.score}/100`
      );
      passedTests++;
    } else {
      console.log(
        `   ❌ FAILED - Final state: ${currentUIState}, Health: ${result.health.score}/100`
      );
      console.log(`   Errors: ${errors.join("; ")}`);
      failedTests++;
    }

    console.log("");
  }

  // Summary
  console.log("📊 VALIDATION SUMMARY");
  console.log("====================");
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  console.log(
    `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
  );

  if (failedTests > 0) {
    console.log("\n❌ FAILED TESTS:");
    results
      .filter((r) => !r.passed)
      .forEach((result) => {
        console.log(`   • ${result.name}: ${result.errors.join("; ")}`);
      });
  }

  // Health analysis
  const avgHealth =
    results.reduce((sum, r) => sum + r.health.score, 0) / results.length;
  console.log(`\n🏥 Average Health Score: ${avgHealth.toFixed(1)}/100`);

  const lowHealthTests = results.filter((r) => r.health.score < 80);
  if (lowHealthTests.length > 0) {
    console.log("\n⚠️  LOW HEALTH SCORES:");
    lowHealthTests.forEach((result) => {
      console.log(
        `   • ${result.name}: ${
          result.health.score
        }/100 - ${result.health.issues.join(", ")}`
      );
    });
  }

  // Recommendations
  console.log("\n💡 RECOMMENDATIONS:");
  if (failedTests === 0 && avgHealth >= 90) {
    console.log("   🎉 Excellent! All call flows are working correctly.");
  } else if (failedTests === 0 && avgHealth >= 80) {
    console.log("   ✅ Good! All tests pass but some optimizations possible.");
  } else if (failedTests < totalTests * 0.2) {
    console.log("   ⚠️  Most tests pass but some issues need attention.");
  } else {
    console.log("   🚨 Multiple issues detected. Review call flow logic.");
  }

  return {
    totalTests,
    passedTests,
    failedTests,
    successRate: (passedTests / totalTests) * 100,
    averageHealth: avgHealth,
    results,
  };
}

// Run validation if called directly
if (require.main === module) {
  try {
    const results = runValidation();
    process.exit(results.failedTests > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Validation failed with error:", error.message);
    process.exit(1);
  }
}

module.exports = { runValidation, testScenarios };
