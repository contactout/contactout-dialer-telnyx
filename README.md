# Telnyx WebRTC Dialer

A simple, responsive dialer app built with Next.js and Telnyx WebRTC SDK. Features a mobile-first design with a phone mockup for desktop users.

## Features

- 📱 **Responsive Design**: Mobile-first with desktop phone mockup
- ☎️ **WebRTC Calling**: Make and receive calls using Telnyx WebRTC
- 🎯 **DTMF Support**: Send touch tones during active calls
- 🎨 **Modern UI**: Clean interface with TailwindCSS
- 🚀 **Vercel Ready**: Optimized for Vercel deployment

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Telnyx WebRTC SDK** - Voice calling functionality

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Telnyx Credentials

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```

2. Get your Telnyx credentials from the [Telnyx Portal](https://portal.telnyx.com):
   - **API Key**: Go to API Keys section
   - **SIP Credentials**: Go to SIP > Credentials

3. Update `.env.local` with your credentials:
   ```env
   NEXT_PUBLIC_TELNYX_API_KEY=your_api_key_here
   NEXT_PUBLIC_TELNYX_SIP_USERNAME=your_sip_username_here
   NEXT_PUBLIC_TELNYX_SIP_PASSWORD=your_sip_password_here
   ```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Usage

### Mobile View
- Clean dial pad interface optimized for touch
- Direct number entry and calling

### Desktop View
- iPhone-style mockup frame
- Same functionality in an elegant desktop presentation

### Making Calls
1. Ensure you see "Connected" status (green indicator)
2. Enter a phone number using the dial pad
3. Press "Call" to initiate the call
4. Use "Hang Up" to end the call

### During Calls
- Use the dial pad to send DTMF tones
- Call status shows "Call Active" with pulsing indicator

## Project Structure

```
├── app/
│   ├── page.tsx          # Main application page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main application
├── components/
│   ├── DialPad.tsx          # Dial pad component
│   └── PhoneMockup.tsx      # Desktop phone frame
├── hooks/
│   ├── useDeviceDetection.ts # Mobile/desktop detection
│   └── useTelnyxWebRTC.ts   # Telnyx WebRTC integration
└── .env.local               # Environment variables
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_TELNYX_API_KEY` | Your Telnyx API key | Yes |
| `NEXT_PUBLIC_TELNYX_SIP_USERNAME` | SIP connection username | Yes |
| `NEXT_PUBLIC_TELNYX_SIP_PASSWORD` | SIP connection password | Yes |

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Adding Features

The app is designed to be easily extensible:

- **Call History**: Add state management for call logs
- **Contacts**: Integrate contact management
- **Settings**: Add user preferences and configuration
- **Audio Controls**: Implement mute, hold, transfer features

## Troubleshooting

### Connection Issues
- Verify Telnyx credentials in `.env.local`
- Check browser console for WebRTC errors
- Ensure microphone permissions are granted

### Call Quality
- Test network connectivity
- Check Telnyx service status
- Verify SIP connection configuration

## License

MIT License - feel free to use this project as a starting point for your own applications.
