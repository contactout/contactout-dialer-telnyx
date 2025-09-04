#!/usr/bin/env node

/**
 * CALL FLOW TEST RUNNER
 *
 * This script runs comprehensive call flow tests to ensure all scenarios
 * work correctly. It simulates real-world call conditions and validates
 * the entire call flow system.
 *
 * Usage:
 *   node scripts/run-call-flow-tests.js
 *   npm run test:call-flow
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Test configuration
const testConfig = {
  // Test files to run
  testFiles: [
    "__tests__/call-flow.test.ts",
    "__tests__/call-flow-simulation.test.ts",
  ],

  // Validation script
  validationScript: "scripts/validate-call-flow.js",

  // Output directory
  outputDir: "test-results",

  // Test timeout (in milliseconds)
  timeout: 30000,
};

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${"=".repeat(60)}`, "cyan");
  log(`  ${message}`, "bright");
  log(`${"=".repeat(60)}`, "cyan");
}

function logSection(message) {
  log(`\n${"-".repeat(40)}`, "blue");
  log(`  ${message}`, "blue");
  log(`${"-".repeat(40)}`, "blue");
}

function logSuccess(message) {
  log(`✅ ${message}`, "green");
}

function logError(message) {
  log(`❌ ${message}`, "red");
}

function logWarning(message) {
  log(`⚠️  ${message}`, "yellow");
}

function logInfo(message) {
  log(`ℹ️  ${message}`, "blue");
}

// Test runner functions
function runJestTests() {
  logSection("Running Jest Test Suite");

  try {
    logInfo("Running call flow tests...");

    const jestCommand =
      'npm test -- --testPathPattern="call-flow" --verbose --coverage';
    const output = execSync(jestCommand, {
      encoding: "utf8",
      timeout: testConfig.timeout,
      stdio: "pipe",
    });

    logSuccess("Jest tests completed successfully");
    return { success: true, output };
  } catch (error) {
    logError(`Jest tests failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      output: error.stdout || error.stderr,
    };
  }
}

function runValidationScript() {
  logSection("Running Call Flow Validation");

  try {
    logInfo("Validating call flow scenarios...");

    const validationPath = path.join(
      process.cwd(),
      testConfig.validationScript
    );
    const output = execSync(`node "${validationPath}"`, {
      encoding: "utf8",
      timeout: testConfig.timeout,
      stdio: "pipe",
    });

    logSuccess("Call flow validation completed");
    return { success: true, output };
  } catch (error) {
    logError(`Call flow validation failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      output: error.stdout || error.stderr,
    };
  }
}

function checkTestFiles() {
  logSection("Checking Test Files");

  const missingFiles = [];
  const existingFiles = [];

  testConfig.testFiles.forEach((file) => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      existingFiles.push(file);
      logSuccess(`Found test file: ${file}`);
    } else {
      missingFiles.push(file);
      logError(`Missing test file: ${file}`);
    }
  });

  const validationPath = path.join(process.cwd(), testConfig.validationScript);
  if (fs.existsSync(validationPath)) {
    logSuccess(`Found validation script: ${testConfig.validationScript}`);
  } else {
    logError(`Missing validation script: ${testConfig.validationScript}`);
    missingFiles.push(testConfig.validationScript);
  }

  return { missingFiles, existingFiles };
}

function generateTestReport(results) {
  logSection("Generating Test Report");

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      successRate: 0,
    },
    results: results,
    recommendations: [],
  };

  // Calculate summary
  results.forEach((result) => {
    if (result.type === "jest") {
      // Parse Jest output for test counts
      const output = result.output || "";
      const passedMatch = output.match(/(\d+) passing/);
      const failedMatch = output.match(/(\d+) failing/);

      if (passedMatch) report.summary.passedTests += parseInt(passedMatch[1]);
      if (failedMatch) report.summary.failedTests += parseInt(failedMatch[1]);
    } else if (result.type === "validation") {
      // Parse validation output
      const output = result.output || "";
      const totalMatch = output.match(/Total Tests: (\d+)/);
      const passedMatch = output.match(/Passed: (\d+)/);
      const failedMatch = output.match(/Failed: (\d+)/);

      if (totalMatch) report.summary.totalTests += parseInt(totalMatch[1]);
      if (passedMatch) report.summary.passedTests += parseInt(passedMatch[1]);
      if (failedMatch) report.summary.failedTests += parseInt(failedMatch[1]);
    }
  });

  report.summary.totalTests =
    report.summary.passedTests + report.summary.failedTests;
  report.summary.successRate =
    report.summary.totalTests > 0
      ? (report.summary.passedTests / report.summary.totalTests) * 100
      : 0;

  // Generate recommendations
  if (report.summary.successRate === 100) {
    report.recommendations.push(
      "🎉 All tests pass! Call flow system is working perfectly."
    );
  } else if (report.summary.successRate >= 90) {
    report.recommendations.push(
      "✅ Excellent! Most tests pass. Review any failed tests."
    );
  } else if (report.summary.successRate >= 80) {
    report.recommendations.push(
      "⚠️ Good performance but some issues need attention."
    );
  } else if (report.summary.successRate >= 60) {
    report.recommendations.push(
      "🚨 Multiple issues detected. Review call flow logic."
    );
  } else {
    report.recommendations.push(
      "💥 Critical issues found. Immediate attention required."
    );
  }

  // Save report
  const outputDir = path.join(process.cwd(), testConfig.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const reportPath = path.join(
    outputDir,
    `call-flow-test-report-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  logSuccess(`Test report saved to: ${reportPath}`);
  return report;
}

function displaySummary(report) {
  logHeader("TEST SUMMARY");

  log(`Total Tests: ${report.summary.totalTests}`, "bright");
  log(`Passed: ${report.summary.passedTests}`, "green");
  log(`Failed: ${report.summary.failedTests}`, "red");
  log(
    `Success Rate: ${report.summary.successRate.toFixed(1)}%`,
    report.summary.successRate >= 90
      ? "green"
      : report.summary.successRate >= 80
      ? "yellow"
      : "red"
  );

  logSection("RECOMMENDATIONS");
  report.recommendations.forEach((rec) => {
    log(rec, "cyan");
  });

  // Display individual test results
  logSection("DETAILED RESULTS");
  report.results.forEach((result) => {
    const status = result.success ? "✅ PASSED" : "❌ FAILED";
    const color = result.success ? "green" : "red";
    log(`${status} - ${result.type.toUpperCase()}`, color);

    if (!result.success && result.error) {
      log(`   Error: ${result.error}`, "red");
    }
  });
}

function runAllTests() {
  logHeader("CALL FLOW COMPREHENSIVE TEST SUITE");

  const startTime = Date.now();
  const results = [];

  // Check test files
  const fileCheck = checkTestFiles();
  if (fileCheck.missingFiles.length > 0) {
    logError(
      `Missing ${fileCheck.missingFiles.length} test files. Cannot proceed.`
    );
    process.exit(1);
  }

  // Run Jest tests
  const jestResult = runJestTests();
  results.push({ type: "jest", ...jestResult });

  // Run validation script
  const validationResult = runValidationScript();
  results.push({ type: "validation", ...validationResult });

  // Generate report
  const report = generateTestReport(results);

  // Display summary
  displaySummary(report);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  log(`\n⏱️  Total execution time: ${duration.toFixed(2)} seconds`, "blue");

  // Exit with appropriate code
  const hasFailures = results.some((r) => !r.success);
  if (hasFailures) {
    log("\n🚨 Some tests failed. Please review the results.", "red");
    process.exit(1);
  } else {
    log("\n🎉 All tests passed successfully!", "green");
    process.exit(0);
  }
}

// Handle command line arguments
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Call Flow Test Runner

Usage: node scripts/run-call-flow-tests.js [options]

Options:
  --help, -h     Show this help message
  --jest-only    Run only Jest tests
  --validation-only  Run only validation script
  --verbose      Show detailed output

Examples:
  node scripts/run-call-flow-tests.js
  node scripts/run-call-flow-tests.js --jest-only
  node scripts/run-call-flow-tests.js --validation-only
    `);
    process.exit(0);
  }

  if (args.includes("--jest-only")) {
    logHeader("Running Jest Tests Only");
    const result = runJestTests();
    process.exit(result.success ? 0 : 1);
  }

  if (args.includes("--validation-only")) {
    logHeader("Running Validation Only");
    const result = runValidationScript();
    process.exit(result.success ? 0 : 1);
  }

  // Run all tests by default
  runAllTests();
}

module.exports = {
  runAllTests,
  runJestTests,
  runValidationScript,
  checkTestFiles,
  generateTestReport,
};
