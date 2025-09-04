/**
 * Jest Test Sequencer
 *
 * Ensures call flow tests run first to catch critical issues early
 */

const Sequencer = require("@jest/test-sequencer").default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Sort tests to run call flow tests first
    const callFlowTests = tests.filter((test) =>
      test.path.includes("call-flow.test.ts")
    );

    const otherTests = tests.filter(
      (test) => !test.path.includes("call-flow.test.ts")
    );

    // Run call flow tests first, then others
    return [...callFlowTests, ...otherTests];
  }
}

module.exports = CustomSequencer;
