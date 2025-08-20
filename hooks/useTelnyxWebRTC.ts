import { useState, useEffect, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';

interface TelnyxConfig {
  apiKey: string;
  sipUsername: string;
  sipPassword: string;
}

export const useTelnyxWebRTC = (config: TelnyxConfig) => {
  const [client, setClient] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize Telnyx client
  useEffect(() => {
    if (!config.apiKey || !config.sipUsername || !config.sipPassword) {
      setError('Missing Telnyx credentials');
      return;
    }

    try {
      const telnyxClient = new TelnyxRTC({
        login_token: config.apiKey,
        login: config.sipUsername,
        password: config.sipPassword,
      });

      // Set up event listeners
      telnyxClient.on('telnyx.ready', () => {
        console.log('Telnyx client ready');
        setIsConnected(true);
        setError(null);
      });

      telnyxClient.on('telnyx.error', (error: any) => {
        console.error('Telnyx error:', error);
        setError(error.message || 'Connection error');
        setIsConnected(false);
      });

      telnyxClient.on('telnyx.socket.close', () => {
        console.log('Telnyx connection closed');
        setIsConnected(false);
      });

      // Handle call notifications
      telnyxClient.on('telnyx.notification', (notification: any) => {
        if (notification.type === 'callUpdate') {
          const call = notification.call;
          console.log('Call update:', call.state);
          
          switch (call.state) {
            case 'ringing':
              setIsConnecting(true);
              setIsCallActive(false);
              break;
            case 'active':
              setIsCallActive(true);
              setIsConnecting(false);
              setError(null);
              break;
            case 'hangup':
            case 'destroy':
              setIsCallActive(false);
              setIsConnecting(false);
              setCurrentCall(null);
              break;
            case 'purge':
              setIsCallActive(false);
              setIsConnecting(false);
              setCurrentCall(null);
              setError('Call failed');
              break;
          }
        }
      });

      setClient(telnyxClient);

      // Connect to Telnyx
      telnyxClient.connect();

      return () => {
        if (telnyxClient) {
          telnyxClient.disconnect();
        }
      };
    } catch (err) {
      console.error('Failed to initialize Telnyx client:', err);
      setError('Failed to initialize WebRTC client');
    }
  }, [config.apiKey, config.sipUsername, config.sipPassword]);

  // Make a call
  const makeCall = useCallback(async (phoneNumber: string) => {
    if (!client || !isConnected) {
      setError('Not connected to Telnyx');
      return;
    }

    if (!phoneNumber) {
      setError('Phone number is required');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      const call = client.newCall({
        destinationNumber: phoneNumber,
        callerNumber: config.sipUsername,
      });

      setCurrentCall(call);
    } catch (err: any) {
      console.error('Failed to make call:', err);
      setError(err.message || 'Failed to make call');
      setIsConnecting(false);
    }
  }, [client, isConnected, config.sipUsername]);

  // Hang up call
  const hangupCall = useCallback(() => {
    if (currentCall) {
      try {
        currentCall.hangup();
      } catch (err) {
        console.error('Failed to hang up call:', err);
      }
    }
  }, [currentCall]);

  // Send DTMF tones during call
  const sendDTMF = useCallback((digit: string) => {
    if (currentCall && isCallActive) {
      try {
        currentCall.dtmf(digit);
      } catch (err) {
        console.error('Failed to send DTMF:', err);
      }
    }
  }, [currentCall, isCallActive]);

  return {
    isConnected,
    isCallActive,
    isConnecting,
    error,
    makeCall,
    hangupCall,
    sendDTMF,
  };
};
