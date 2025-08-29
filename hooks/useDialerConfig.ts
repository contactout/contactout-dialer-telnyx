import { useMemo, useEffect } from "react";

export interface TelnyxConfig {
  apiKey: string;
  sipUsername: string;
  sipPassword: string;
  phoneNumber: string;
}

export interface DialerConfig {
  telnyxConfig: TelnyxConfig;
  hasAllCredentials: boolean;
  configurationIssues: string[];
}

export const useDialerConfig = (): DialerConfig => {
  // Memoize configuration to prevent unnecessary re-renders
  const telnyxConfig = useMemo(
    () => ({
      apiKey: process.env.NEXT_PUBLIC_TELNYX_API_KEY || "",
      sipUsername: process.env.NEXT_PUBLIC_TELNYX_SIP_USERNAME || "",
      sipPassword: process.env.NEXT_PUBLIC_TELNYX_SIP_PASSWORD || "",
      phoneNumber: process.env.NEXT_PUBLIC_TELNYX_PHONE_NUMBER || "",
    }),
    []
  );

  // Check for configuration issues
  const configurationIssues = useMemo(() => {
    const issues: string[] = [];

    if (telnyxConfig.phoneNumber === telnyxConfig.sipPassword) {
      issues.push("Phone number is set to SIP password value");
    }

    if (telnyxConfig.sipUsername === telnyxConfig.sipPassword) {
      issues.push("SIP username is set to SIP password value");
    }

    if (!telnyxConfig.apiKey) {
      issues.push("Missing Telnyx API key");
    }

    if (!telnyxConfig.sipUsername) {
      issues.push("Missing SIP username");
    }

    if (!telnyxConfig.sipPassword) {
      issues.push("Missing SIP password");
    }

    if (!telnyxConfig.phoneNumber) {
      issues.push("Missing phone number");
    }

    return issues;
  }, [telnyxConfig]);

  // Log configuration issues
  useEffect(() => {
    if (configurationIssues.length > 0) {
      console.error("Configuration issues detected:");
      configurationIssues.forEach((issue) => {
        console.error(`- ${issue}`);
      });
      console.error(
        "This indicates an environment variable configuration issue."
      );
    }
  }, [configurationIssues]);

  // Check if all required credentials are present
  const hasAllCredentials = useMemo(() => {
    return Boolean(
      telnyxConfig.apiKey &&
        telnyxConfig.sipUsername &&
        telnyxConfig.sipPassword &&
        telnyxConfig.phoneNumber
    );
  }, [telnyxConfig]);

  return {
    telnyxConfig,
    hasAllCredentials,
    configurationIssues,
  };
};
