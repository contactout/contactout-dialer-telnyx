# Call Flow Documentation

## 🚨 CRITICAL: Call Flow Synchronization

This document describes the critical call flow synchronization between Telnyx WebRTC and the UI. **This flow must not break** as it directly impacts user experience.

## The Problem We Solved

### Original Issue

- User clicks call → UI shows "Dialing..."
- Telnyx call starts → UI stays on "Dialing..." (ringing state never triggered)
- User gets redirected to dialpad → **THEN** ringing starts (too late)

### Root Cause

The call state monitoring logic was checking if the UI state was "idle" before transitioning to "dialing" or "ringing" states. However, when a call is initiated, the UI state is never "idle" - it's already in a connecting state, which prevented proper state transitions.

## Expected Call Flow

```
User clicks call
    ↓
UI: "Dialing..." (immediate)
    ↓
Telnyx: "new" → "requesting" → "trying"
    ↓
Telnyx: "early" (ICE connection established)
    ↓
UI: "Ringing..." (immediate transition)
    ↓
Telnyx: "answered"
    ↓
UI: "Connected"
```

## State Mapping

| Telnyx State | Expected UI State | Description                                |
| ------------ | ----------------- | ------------------------------------------ |
| `new`        | `dialing`         | Call just created                          |
| `requesting` | `dialing`         | Call is being requested                    |
| `trying`     | `dialing`         | Call is trying to connect                  |
| `early`      | `ringing`         | ICE connection established, remote ringing |
| `ringing`    | `ringing`         | Remote party is ringing                    |
| `answered`   | `connected`       | Call is answered                           |
| `connected`  | `connected`       | Call is active                             |
| `hangup`     | `ended`           | Call ended normally                        |
| `destroy`    | `ended`           | Call destroyed                             |
| `failed`     | `ended`           | Call failed                                |

## Critical Code Locations

### 1. Call State Monitoring (`useTelnyxWebRTC.ts`)

```typescript
// CRITICAL: Use validator to ensure proper call flow synchronization
const flowValidation = validateCallFlowSequence(call.state, currentUIState);

if (flowValidation.shouldTransition && flowValidation.targetState) {
  console.log(
    `🔄 Call flow transition: ${currentUIState} → ${flowValidation.targetState} (${flowValidation.reason})`
  );
  transitionCallState(flowValidation.targetState, call);
  return;
}
```

### 2. State Validator (`lib/callStateValidator.ts`)

```typescript
export function validateCallFlowSequence(
  telnyxState: string,
  currentUIState: CallState
): {
  shouldTransition: boolean;
  targetState: CallState | null;
  reason: string;
} {
  // CRITICAL: These mappings ensure UI state syncs with Telnyx state
  const telnyxToUIStateMap: Record<string, CallState> = {
    new: "dialing",
    requesting: "dialing",
    trying: "dialing",
    early: "ringing", // ← This is the critical transition
    ringing: "ringing",
    answered: "connected",
    // ...
  };
}
```

## Safeguards Implemented

### 1. Call State Validator

- Validates all state transitions
- Prevents invalid state combinations
- Provides detailed error messages

### 2. Development Monitor

- Real-time call flow health monitoring
- Alerts when sync issues are detected
- Visual health score and recommendations

### 3. Comprehensive Tests

- Unit tests for all state transitions
- Integration tests for complete call flow
- Regression tests for the specific sync issue

### 4. Health Check System

- Continuous monitoring of call flow health
- Automatic detection of stuck states
- Recommendations for fixing issues

## Testing the Fix

### Manual Testing

1. Open the app in development mode
2. Look for the call flow monitor (bottom-right corner)
3. Make a test call
4. Verify the health score stays above 80
5. Check that ringing starts immediately when call reaches "early" state

### Automated Testing

```bash
npm test -- call-flow.test.ts
```

## Common Issues and Solutions

### Issue: "UI stuck in dialing while Telnyx is ringing"

**Solution**: Check that `validateCallFlowSequence` is being called and returning the correct target state.

### Issue: "Ringing only starts after redirect to dialpad"

**Solution**: This is the main issue we fixed. Ensure the state monitoring logic uses the validator instead of checking for "idle" state.

### Issue: "Call gets stuck in connecting state"

**Solution**: Check the timeout logic and ensure proper cleanup in `transitionCallState`.

### Issue: "Cannot make new calls after hanging up"

**Solution**: This was caused by overly restrictive call blocking logic. The fix allows calls when in "ended" state and forces immediate state reset if stuck.

### Issue: "UI remains in connecting state after call ends"

**Solution**: Enhanced the "ended" → "idle" transition with robust error handling and timeout management to prevent stuck states.

### Issue: "UI stuck in connecting state even when call is ringing"

**Solution**: The root cause was using incorrect event listeners. Fixed by implementing proper `telnyx.notification` event handler as per Telnyx documentation, which handles all call state changes through the centralized notification system.

### Issue: "Auto-redial after call rejection"

**Solution**: This was caused by missing hangup event handling. Fixed by properly implementing `telnyx.notification` events to detect `hangup` and `destroy` states, ensuring proper call completion and preventing auto-redial.

### Issue: "Infinite console logging after call ends"

**Problem**: After a call ends, the console logs continuously, causing the Chrome tab to freeze and the console to black out. This was accompanied by a `RangeError: Maximum call stack size exceeded` error.

**Root Cause**: The primary cause was a recursive call to `call.hangup()` within the `handleCallHangup` function. When the `telnyx.notification` handler received a `hangup` notification, it called `handleCallHangup`, which then called `call.hangup()`, which triggered another `hangup` notification, creating an infinite loop.

**Solution**:

1. **CRITICAL FIX**: Refactored `handleCallHangup` to `performCallCleanup` and removed the recursive `call.hangup()` call that was causing the infinite loop
2. Removed problematic `ended → ringing` state transition from `validTransitions`
3. Added comprehensive logging guards to prevent rapid console output:
   - Notification handler logging guard (200ms minimum)
   - Call state update logging guard (300ms minimum)
   - State transition logging guard (250ms minimum)
   - Enhanced transition state logging guard (150ms minimum with duplicate detection)
4. Prevented recursive `transitionCallState` calls by using direct state updates
5. Updated the `telnyx.notification` handler to call `performCallCleanup` instead of `handleCallHangup`

### Issue: "No notification when call is rejected"

**Solution**:

1. Added detection logic to identify rejected calls (short duration while ringing) and display appropriate error message: "Call rejected - The other party declined the call"
2. Fixed error popup logic in `useDialer.ts` to ensure rejection notifications are always shown, regardless of call state
3. Enhanced error handling to force state reset when call rejections occur

## Development Guidelines

### When Making Changes to Call Flow:

1. **Always run the tests first**:

   ```bash
   npm test -- call-flow.test.ts
   ```

2. **Check the call flow monitor** in development mode

3. **Validate state transitions** using the validator:

   ```typescript
   import { validateCallStateTransition } from "@/lib/callStateValidator";
   ```

4. **Add new tests** for any new state transitions

5. **Update this documentation** if you change the flow

### Code Review Checklist:

- [ ] Call flow tests pass
- [ ] No new state transition issues in monitor
- [ ] Health score remains above 80
- [ ] Documentation updated if needed

## Monitoring in Production

The call flow monitor is automatically disabled in production, but the validation logic remains active. Monitor these metrics:

- Call success rate
- Time to ringing (should be < 2 seconds)
- User complaints about delayed ringing

## Emergency Rollback

If the call flow breaks in production:

1. **Immediate fix**: Revert to the previous working version
2. **Root cause**: Check the call state monitoring logic
3. **Prevention**: Add more comprehensive tests

## Related Files

- `hooks/useTelnyxWebRTC.ts` - Main call flow logic
- `lib/callStateValidator.ts` - State validation utilities
- `components/CallFlowMonitor.tsx` - Development monitoring
- `__tests__/call-flow.test.ts` - Comprehensive tests
- `CALL_FLOW_DOCUMENTATION.md` - This documentation

---

**Remember**: This call flow is critical for user experience. Any changes must be thoroughly tested and validated.
