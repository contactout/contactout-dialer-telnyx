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
