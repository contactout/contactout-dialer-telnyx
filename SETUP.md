# Telnyx WebRTC Dialer Setup Guide

## Prerequisites

To use this application, you need:

1. **A Telnyx account** with WebRTC capabilities enabled
2. **A microphone** connected to your device
3. **Modern browser** that supports WebRTC (Chrome, Firefox, Safari, Edge)

## Required Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Your Telnyx API Key (required)
NEXT_PUBLIC_TELNYX_API_KEY=your_telnyx_api_key_here

# Your Telnyx SIP Username (required)
NEXT_PUBLIC_TELNYX_SIP_USERNAME=your_sip_username_here

# Your Telnyx SIP Password (required)
NEXT_PUBLIC_TELNYX_SIP_PASSWORD=your_sip_password_here

# Your Telnyx Phone Number (required)
NEXT_PUBLIC_TELNYX_PHONE_NUMBER=+1234567890
```

## Getting Your Telnyx Credentials

1. **API Key**: Go to [Telnyx Portal](https://portal.telnyx.com/) → API Keys → Create API Key
2. **SIP Credentials**: Go to [Telnyx Portal](https://portal.telnyx.com/) → SIP → Create SIP User
3. **Phone Number**: Go to [Telnyx Portal](https://portal.telnyx.com/) → Numbers → Buy Numbers

## Troubleshooting Connection Issues

### Telnyx Not Connected (Red Status Indicator)

**Common Causes:**

- Missing or incorrect environment variables
- Invalid API key or SIP credentials
- Network connectivity issues
- Telnyx service outage

**Solutions:**

1. Verify all environment variables are set correctly
2. Check your Telnyx credentials in the portal
3. Ensure your network allows WebRTC connections
4. Click the "Reconnect" button to retry connection
5. Check [Telnyx Status Page](https://status.telnyx.com/) for service issues

### Microphone Not Ready (Red Microphone Indicator)

**Common Causes:**

- Microphone permissions denied
- No microphone connected
- Microphone in use by another application
- Browser doesn't support getUserMedia API

**Solutions:**

1. Allow microphone permissions when prompted
2. Connect a microphone to your device
3. Close other applications using the microphone
4. Click "Retry Microphone" button
5. Use a modern browser (Chrome, Firefox, Safari, Edge)

### Call Button Disabled

The call button is automatically disabled when:

- Telnyx is not connected
- Microphone is not ready
- No phone number entered
- Call is already in progress
- System is initializing

**To enable:**

1. Ensure Telnyx is connected (green status indicator)
2. Ensure microphone is ready (green microphone indicator)
3. Enter a valid phone number
4. Wait for initialization to complete

## Automatic Reconnection

The application automatically attempts to reconnect when:

- Connection is lost
- Network issues occur
- Telnyx service becomes unavailable

**Manual Reconnection:**

- Click the "Reconnect" button when connection errors occur
- The system will retry up to 5 times with exponential backoff

## Browser Compatibility

**Supported Browsers:**

- Chrome 66+
- Firefox 60+
- Safari 11+
- Edge 79+

**Required Features:**

- WebRTC support
- getUserMedia API
- AudioContext API

## Security Notes

- Never commit your `.env.local` file to version control
- Keep your Telnyx credentials secure
- Use HTTPS in production for secure WebRTC connections
- Regularly rotate your API keys

## Getting Help

If you continue to experience issues:

1. Check the browser console for error messages
2. Verify your Telnyx account status
3. Test with a different browser
4. Contact Telnyx support for credential issues
5. Check the application logs for detailed error information
