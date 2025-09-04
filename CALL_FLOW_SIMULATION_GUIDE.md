# Call Flow Simulation Guide

## Overview

This guide provides comprehensive documentation for all call flow scenarios that the ContactOut Dialer handles. It includes detailed simulations, expected behaviors, and validation criteria for every possible call state and transition.

## Table of Contents

1. [Successful Call Scenarios](#1-successful-call-scenarios)
2. [Call Failure Scenarios](#2-call-failure-scenarios)
3. [Voice Mail Scenarios](#3-voice-mail-scenarios)
4. [Network and Connection Issues](#4-network-and-connection-issues)
5. [Rapid Call Scenarios](#5-rapid-call-scenarios)
6. [DTMF and Call Features](#6-dtmf-and-call-features)
7. [Error Handling and Recovery](#7-error-handling-and-recovery)
8. [State Synchronization Validation](#8-state-synchronization-validation)
9. [Edge Cases and Boundary Conditions](#9-edge-cases-and-boundary-conditions)
10. [Integration Testing](#10-integration-testing)

## 1. Successful Call Scenarios

### 1.1 Local Call Success

**Scenario**: Complete local call flow from dialing to connected

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `answered`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `connected`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early (ICE connection established)
600ms:  UI shows "Ringing..."
2000ms: Telnyx: answered
2100ms: UI shows "Connected"
```

**Validation Criteria**:

- ✅ UI transitions from dialing to ringing within 2 seconds
- ✅ UI shows "Connected" when call is answered
- ✅ Call duration tracking starts when connected
- ✅ DTMF functionality available during call
- ✅ Hangup properly ends call and returns to idle

### 1.2 International Call Success

**Scenario**: International call with longer connection time

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `answered`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `connected`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
500ms:  Telnyx: requesting
1000ms: Telnyx: trying (longer for international)
3000ms: Telnyx: early
3100ms: UI shows "Ringing..."
5000ms: Telnyx: answered
5100ms: UI shows "Connected"
```

**Validation Criteria**:

- ✅ UI handles longer connection times gracefully
- ✅ No timeout errors during extended connection phase
- ✅ Proper state transitions despite longer delays
- ✅ Call quality indicators work correctly

### 1.3 Mobile Call Success

**Scenario**: Mobile call with direct ringing (skips some states)

**Telnyx States**: `new` → `ringing` → `answered`

**Expected UI States**: `dialing` → `ringing` → `connected`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: ringing (direct to ringing)
300ms:  UI shows "Ringing..."
2000ms: Telnyx: answered
2100ms: UI shows "Connected"
```

**Validation Criteria**:

- ✅ UI handles skipped states gracefully
- ✅ Direct transition from dialing to ringing works
- ✅ No state synchronization issues

### 1.4 Landline Call Success

**Scenario**: Standard landline call progression

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `answered`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `connected`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early
600ms:  UI shows "Ringing..."
3000ms: Telnyx: answered
3100ms: UI shows "Connected"
```

**Validation Criteria**:

- ✅ Standard progression through all states
- ✅ Consistent timing and behavior
- ✅ Reliable state transitions

## 2. Call Failure Scenarios

### 2.1 Invalid Number

**Scenario**: Call to invalid phone number

**Telnyx States**: `new` → `failed`

**Expected UI States**: `dialing` → `ended`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: failed
300ms:  UI shows error popup
```

**Validation Criteria**:

- ✅ Error popup displayed with clear message
- ✅ Call state properly reset to idle
- ✅ User can retry or return to dialpad
- ✅ No stuck states or UI inconsistencies

### 2.2 Busy Number

**Scenario**: Call to busy number

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `hangup`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `ended`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early
600ms:  UI shows "Ringing..."
2000ms: Telnyx: hangup (busy)
2100ms: UI shows "Number is busy" error
```

**Validation Criteria**:

- ✅ Proper progression to ringing state
- ✅ Busy error detected and displayed
- ✅ Call marked as failed in history
- ✅ User can retry or try different number

### 2.3 No Answer

**Scenario**: Call with no answer

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `ringing` → `hangup`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `ringing` → `ended`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early
600ms:  UI shows "Ringing..."
30000ms: Telnyx: hangup (no-answer)
30100ms: UI shows "No answer" error
```

**Validation Criteria**:

- ✅ Extended ringing period handled gracefully
- ✅ No answer timeout properly detected
- ✅ Call marked as failed in history
- ✅ User can retry or try different number

### 2.4 Call Rejected

**Scenario**: Call rejected by recipient

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `hangup`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `ended`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early
600ms:  UI shows "Ringing..."
2000ms: Telnyx: hangup (rejected)
2100ms: UI shows "Call rejected" error
```

**Validation Criteria**:

- ✅ Quick rejection detected properly
- ✅ Appropriate error message displayed
- ✅ Call marked as failed in history

### 2.5 Network Timeout

**Scenario**: Call timeout during connection

**Telnyx States**: `new` → `requesting` → `trying` (stuck)

**Expected UI States**: `dialing` → `dialing` → `dialing`

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
45000ms: Timeout triggered
45100ms: UI shows "Call failed" error
```

**Validation Criteria**:

- ✅ 45-second timeout properly enforced
- ✅ Timeout error displayed clearly
- ✅ Call state properly reset
- ✅ User can retry or try different number

## 3. Voice Mail Scenarios

### 3.1 Voice Mail Detection - Telnyx Indicator

**Scenario**: Voice mail detected by Telnyx

**Telnyx States**: `new` → `requesting` → `trying` → `early` → `answered`

**Expected UI States**: `dialing` → `dialing` → `dialing` → `ringing` → `voicemail`

**Call Properties**:

```javascript
{
  voice_mail_detected: true,
  machine_answer: false,
  headers: {}
}
```

**Timeline**:

```
0ms:    User clicks call button
50ms:   UI shows "Dialing..."
100ms:  Telnyx: new
200ms:  Telnyx: requesting
300ms:  Telnyx: trying
500ms:  Telnyx: early
600ms:  UI shows "Ringing..."
2000ms: Telnyx: answered (with voice mail indicators)
2100ms: UI shows "Voice Mail - Leave a message"
```

**Validation Criteria**:

- ✅ Voice mail properly detected
- ✅ UI shows voice mail status
- ✅ DTMF available for voice mail navigation
- ✅ Call marked as voice mail in history

### 3.2 Voice Mail Detection - Machine Answer

**Scenario**: Voice mail detected by machine answer

**Call Properties**:

```javascript
{
  voice_mail_detected: false,
  machine_answer: true,
  headers: {}
}
```

**Validation Criteria**:

- ✅ Machine answer detection works
- ✅ Conservative detection prevents false positives
- ✅ Normal calls not classified as voice mail

### 3.3 Voice Mail Detection - Headers

**Scenario**: Voice mail detected by headers

**Call Properties**:

```javascript
{
  voice_mail_detected: false,
  machine_answer: false,
  headers: {
    "X-Voice-Mail": "true"
  }
}
```

**Validation Criteria**:

- ✅ Header-based detection works
- ✅ Multiple detection methods supported

### 3.4 Normal Call (Not Voice Mail)

**Scenario**: Normal answered call without voice mail indicators

**Call Properties**:

```javascript
{
  voice_mail_detected: false,
  machine_answer: false,
  headers: {}
}
```

**Validation Criteria**:

- ✅ Normal calls classified as connected
- ✅ No false voice mail detection
- ✅ Conservative detection threshold (confidence >= 8)

## 4. Network and Connection Issues

### 4.1 Connection Lost During Call

**Scenario**: Network connection lost during active call

**Timeline**:

```
0ms:    Call established and connected
5000ms: Network connection lost
5100ms: UI shows "Connection lost" error
5200ms: Reconnection attempts start
```

**Validation Criteria**:

- ✅ Connection loss detected quickly
- ✅ User notified of connection issue
- ✅ Reconnection attempts initiated
- ✅ Call state properly handled

### 4.2 Connection Restored

**Scenario**: Network connection restored after loss

**Timeline**:

```
0ms:    Connection lost
5000ms: Connection restored
5100ms: UI shows "Connection restored"
5200ms: Normal call functionality resumes
```

**Validation Criteria**:

- ✅ Connection restoration detected
- ✅ User notified of restoration
- ✅ Call functionality resumes
- ✅ No data loss or state corruption

### 4.3 Authentication Failure

**Scenario**: Telnyx authentication fails

**Timeline**:

```
0ms:    Attempt to connect to Telnyx
100ms:  Authentication failure
200ms:  UI shows "Authentication failed" error
```

**Validation Criteria**:

- ✅ Authentication errors handled gracefully
- ✅ Clear error message displayed
- ✅ User can retry or check credentials
- ✅ No infinite retry loops

## 5. Rapid Call Scenarios

### 5.1 Rapid Successive Calls

**Scenario**: Multiple rapid calls without state corruption

**Timeline**:

```
0ms:    First call initiated
2000ms: First call completed
2100ms: Second call initiated immediately
4000ms: Second call completed
4100ms: Third call initiated immediately
```

**Validation Criteria**:

- ✅ No state corruption between calls
- ✅ Each call properly isolated
- ✅ Clean state transitions
- ✅ No memory leaks or resource issues

### 5.2 Call During Active Call

**Scenario**: Attempt to start new call during active call

**Timeline**:

```
0ms:    First call initiated
2000ms: First call connected
2100ms: User attempts second call
2200ms: Second call blocked/ignored
```

**Validation Criteria**:

- ✅ Second call properly blocked
- ✅ First call continues uninterrupted
- ✅ User notified of call in progress
- ✅ No state conflicts

## 6. DTMF and Call Features

### 6.1 DTMF During Call

**Scenario**: Sending DTMF tones during active call

**Timeline**:

```
0ms:    Call connected
1000ms: User presses "1" on dialpad
1100ms: DTMF tone sent to Telnyx
2000ms: User presses "2" on dialpad
2100ms: DTMF tone sent to Telnyx
```

**Validation Criteria**:

- ✅ DTMF tones sent correctly
- ✅ No call state disruption
- ✅ Audio feedback provided
- ✅ Multiple tones handled properly

### 6.2 Call Duration Tracking

**Scenario**: Accurate call duration tracking

**Timeline**:

```
0ms:    Call connected, duration starts
1000ms: Duration = 1 second
5000ms: Duration = 5 seconds
10000ms: Duration = 10 seconds
```

**Validation Criteria**:

- ✅ Duration tracking starts when connected
- ✅ Accurate time calculation
- ✅ UI updates in real-time
- ✅ Duration saved in call history

## 7. Error Handling and Recovery

### 7.1 Error Recovery

**Scenario**: Recovery from various error conditions

**Timeline**:

```
0ms:    Error occurs
100ms:  Error displayed to user
5000ms: User dismisses error
5100ms: System ready for new call
```

**Validation Criteria**:

- ✅ Errors displayed clearly
- ✅ User can dismiss errors
- ✅ System recovers properly
- ✅ New calls possible after error

### 7.2 Force Reset

**Scenario**: Force reset call state when needed

**Timeline**:

```
0ms:    Call in problematic state
100ms:  Force reset triggered
200ms:  All states reset to idle
300ms:  System ready for new call
```

**Validation Criteria**:

- ✅ Force reset works reliably
- ✅ All states properly cleared
- ✅ No residual state issues
- ✅ System ready for new operations

## 8. State Synchronization Validation

### 8.1 UI State Sync

**Scenario**: UI state always matches Telnyx state

**Validation Matrix**:
| Telnyx State | Expected UI State | Valid Transitions |
|--------------|-------------------|-------------------|
| `new` | `dialing` | ✅ |
| `requesting` | `dialing` | ✅ |
| `trying` | `dialing` | ✅ |
| `early` | `ringing` | ✅ |
| `ringing` | `ringing` | ✅ |
| `answered` | `connected` | ✅ |
| `connected` | `connected` | ✅ |
| `hangup` | `ended` | ✅ |
| `destroy` | `ended` | ✅ |
| `failed` | `ended` | ✅ |

**Validation Criteria**:

- ✅ All state transitions valid
- ✅ No invalid state combinations
- ✅ UI always reflects actual call state
- ✅ No stuck or inconsistent states

### 8.2 Invalid State Transitions

**Scenario**: Prevention of invalid state transitions

**Invalid Transitions**:

- `idle` → `connected` (must go through dialing/ringing)
- `dialing` → `voicemail` (must go through ringing first)
- `connected` → `dialing` (invalid backward transition)

**Validation Criteria**:

- ✅ Invalid transitions blocked
- ✅ State validator prevents errors
- ✅ System remains in valid state
- ✅ Error logging for debugging

## 9. Edge Cases and Boundary Conditions

### 9.1 Very Short Calls

**Scenario**: Extremely short calls (< 1 second)

**Timeline**:

```
0ms:    Call initiated
500ms:  Call answered
600ms:  Call ended
```

**Validation Criteria**:

- ✅ Short calls handled properly
- ✅ Not incorrectly marked as failed
- ✅ Duration tracking accurate
- ✅ Call history correct

### 9.2 Very Long Calls

**Scenario**: Very long calls (1+ hours)

**Timeline**:

```
0ms:    Call initiated
3600000ms: Call still active (1 hour)
```

**Validation Criteria**:

- ✅ Long calls supported
- ✅ No timeout issues
- ✅ Duration tracking continues
- ✅ Memory usage stable

### 9.3 Memory and Resource Management

**Scenario**: Proper cleanup after calls

**Validation Criteria**:

- ✅ No memory leaks
- ✅ Resources properly released
- ✅ Event listeners cleaned up
- ✅ Timers cleared

## 10. Integration Testing

### 10.1 Dialer Integration

**Scenario**: Integration with dialer hook

**Validation Criteria**:

- ✅ Phone number input works
- ✅ Call initiation works
- ✅ State synchronization works
- ✅ Error handling works

### 10.2 Error Handling Integration

**Scenario**: Error handling through dialer hook

**Validation Criteria**:

- ✅ Errors properly propagated
- ✅ Error popups displayed
- ✅ User can dismiss errors
- ✅ System recovers properly

## Running the Tests

### Manual Testing

1. **Start the application**:

   ```bash
   npm run dev
   ```

2. **Test each scenario**:
   - Use the call flow monitor (development mode)
   - Make test calls with different numbers
   - Verify state transitions in console
   - Check error handling

### Automated Testing

1. **Run Jest tests**:

   ```bash
   npm test -- --testPathPattern="call-flow"
   ```

2. **Run validation script**:

   ```bash
   node scripts/validate-call-flow.js
   ```

3. **Run comprehensive test suite**:
   ```bash
   node scripts/run-call-flow-tests.js
   ```

### Test Coverage

The test suite covers:

- ✅ All successful call scenarios
- ✅ All failure scenarios
- ✅ All voice mail scenarios
- ✅ All network issues
- ✅ All edge cases
- ✅ All state transitions
- ✅ All error conditions
- ✅ All integration points

## Monitoring and Debugging

### Development Monitor

The call flow monitor (development mode) provides:

- Real-time state visualization
- Health score tracking
- Issue detection and recommendations
- Performance metrics

### Console Logging

Key log messages to monitor:

- `🔄 Call flow transition: [state] → [state]`
- `🚨 Invalid state transition blocked`
- `🎙️ Voice mail detection: confidence=[score]`
- `❌ Call flow issue detected`

### Health Metrics

Monitor these metrics:

- Call success rate (target: >95%)
- Time to ringing (target: <2 seconds)
- State transition accuracy (target: 100%)
- Error recovery rate (target: 100%)

## Conclusion

This comprehensive simulation guide ensures that all call flow scenarios are properly handled. The system is designed to be robust, reliable, and provide excellent user experience across all possible call conditions.

Regular testing using these scenarios will help maintain the quality and reliability of the call flow system.
