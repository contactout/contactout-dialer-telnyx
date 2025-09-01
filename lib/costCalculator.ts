// Telnyx Call Cost Calculator
// Hybrid approach: Real-time API pricing with fallback to hardcoded rates
// Based on pricing from: https://telnyx.com/pricing/call-control

export interface CallCostBreakdown {
  voiceMinutes: number;
  voiceCost: number;
  sipTrunkingCost: number;
  totalCost: number;
  currency: string;
  pricingSource: "api" | "fallback" | "unknown";
}

export interface TelnyxPricing {
  voicePerMinute: number; // $0.002 per minute
  sipTrunkingPerMinute: number; // Varies by region
  currency: string;
}

export interface TelnyxApiPricing {
  country_code: string;
  voice_per_minute: number;
  sip_trunking_per_minute: number;
  currency: string;
  last_updated: string;
}

export class TelnyxCostCalculator {
  // Base Telnyx pricing (fallback rates - updated quarterly)
  private static readonly BASE_PRICING: TelnyxPricing = {
    voicePerMinute: 0.002, // $0.002 per minute
    sipTrunkingPerMinute: 0.001, // Estimated average SIP trunking cost
    currency: "USD",
  };

  // Regional SIP trunking costs (fallback rates - updated quarterly)
  private static readonly REGIONAL_SIP_COSTS: Record<string, number> = {
    US: 0.0005, // US domestic
    CA: 0.0008, // Canada
    UK: 0.0012, // United Kingdom
    DE: 0.0015, // Germany
    AU: 0.002, // Australia
    JP: 0.0018, // Japan
    IN: 0.0025, // India
    BR: 0.003, // Brazil
    MX: 0.0028, // Mexico
    DEFAULT: 0.001, // Default for other regions
  };

  // Cache for API pricing to avoid repeated calls
  private static pricingCache: Map<string, TelnyxApiPricing> = new Map();
  private static cacheExpiry: Map<string, number> = new Map();
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Fetch real-time pricing from Telnyx API (if available)
   * @param countryCode - Country code (e.g., 'US', 'CA')
   * @returns Promise<TelnyxApiPricing | null>
   */
  static async fetchTelnyxPricing(
    countryCode: string
  ): Promise<TelnyxApiPricing | null> {
    try {
      // Check cache first
      const cached = this.pricingCache.get(countryCode);
      const expiry = this.cacheExpiry.get(countryCode);

      if (cached && expiry && Date.now() < expiry) {
        console.log(`Using cached pricing for ${countryCode}`);
        return cached;
      }

      // Fetch from Telnyx API (this would be implemented when API is available)
      // For now, return null to use fallback pricing
      // const response = await fetch(`https://api.telnyx.com/v2/pricing/voice/${countryCode}`);
      // const data = await response.json();

      // Cache the result
      // this.pricingCache.set(countryCode, data);
      // this.cacheExpiry.set(countryCode, Date.now() + this.CACHE_DURATION);

      return null; // API not implemented yet
    } catch (error) {
      console.warn(`Failed to fetch Telnyx pricing for ${countryCode}:`, error);
      return null;
    }
  }

  /**
   * Calculate call cost based on duration and destination using hybrid pricing
   * @param durationMinutes - Call duration in minutes
   * @param destinationCountry - Country code for destination (optional)
   * @returns CallCostBreakdown with detailed cost information
   */
  static async calculateCallCostHybrid(
    durationMinutes: number,
    destinationCountry?: string
  ): Promise<CallCostBreakdown> {
    // Ensure duration is positive
    const minutes = Math.max(0, durationMinutes);

    // Try to get real-time pricing first
    let pricingSource: "api" | "fallback" | "unknown" = "unknown";
    let voicePerMinute = this.BASE_PRICING.voicePerMinute;
    let sipPerMinute = this.getSipTrunkingCost(destinationCountry);

    if (destinationCountry) {
      const apiPricing = await this.fetchTelnyxPricing(destinationCountry);
      if (apiPricing) {
        voicePerMinute = apiPricing.voice_per_minute;
        sipPerMinute = apiPricing.sip_trunking_per_minute;
        pricingSource = "api";
      } else {
        pricingSource = "fallback";
      }
    } else {
      pricingSource = "fallback";
    }

    // Calculate costs
    const voiceCost = minutes * voicePerMinute;
    const sipTrunkingCost = minutes * sipPerMinute;
    const totalCost = voiceCost + sipTrunkingCost;

    return {
      voiceMinutes: minutes,
      voiceCost: this.roundTo4Decimals(voiceCost),
      sipTrunkingCost: this.roundTo4Decimals(sipTrunkingCost),
      totalCost: this.roundTo4Decimals(totalCost),
      currency: this.BASE_PRICING.currency,
      pricingSource,
    };
  }

  /**
   * Calculate call cost based on duration and destination (legacy method)
   * @param durationMinutes - Call duration in minutes
   * @param destinationCountry - Country code for destination (optional)
   * @returns CallCostBreakdown with detailed cost information
   */
  static calculateCallCost(
    durationMinutes: number,
    destinationCountry?: string
  ): CallCostBreakdown {
    // Ensure duration is positive
    const minutes = Math.max(0, durationMinutes);

    // Get SIP trunking cost for the region
    const sipCost = this.getSipTrunkingCost(destinationCountry);

    // Calculate costs
    const voiceCost = minutes * this.BASE_PRICING.voicePerMinute;
    const sipTrunkingCost = minutes * sipCost;
    const totalCost = voiceCost + sipTrunkingCost;

    return {
      voiceMinutes: minutes,
      voiceCost: this.roundTo4Decimals(voiceCost),
      sipTrunkingCost: this.roundTo4Decimals(sipCost),
      totalCost: this.roundTo4Decimals(totalCost),
      currency: this.BASE_PRICING.currency,
      pricingSource: "fallback",
    };
  }

  /**
   * Calculate cost for a completed call with duration
   * @param durationSeconds - Call duration in seconds
   * @param destinationCountry - Country code for destination (optional)
   * @returns CallCostBreakdown
   */
  static calculateCompletedCallCost(
    durationSeconds: number,
    destinationCountry?: string
  ): CallCostBreakdown {
    const durationMinutes = durationSeconds / 60;
    return this.calculateCallCost(durationMinutes, destinationCountry);
  }

  /**
   * Calculate cost for a completed call with duration using hybrid pricing
   * @param durationSeconds - Call duration in seconds
   * @param destinationCountry - Country code for destination (optional)
   * @returns Promise<CallCostBreakdown>
   */
  static async calculateCompletedCallCostHybrid(
    durationSeconds: number,
    destinationCountry?: string
  ): Promise<CallCostBreakdown> {
    const durationMinutes = durationSeconds / 60;
    return this.calculateCallCostHybrid(durationMinutes, destinationCountry);
  }

  /**
   * Calculate estimated cost for a failed/missed call
   * @param destinationCountry - Country code for destination (optional)
   * @returns CallCostBreakdown (usually minimal cost for failed calls)
   */
  static calculateFailedCallCost(
    destinationCountry?: string
  ): CallCostBreakdown {
    // Failed calls typically have minimal or no cost
    // But may incur small connection fees
    const sipCost = this.getSipTrunkingCost(destinationCountry);

    return {
      voiceMinutes: 0,
      voiceCost: 0,
      sipTrunkingCost: this.roundTo4Decimals(sipCost * 0.1), // 10% of 1 minute cost
      totalCost: this.roundTo4Decimals(sipCost * 0.1),
      currency: this.BASE_PRICING.currency,
      pricingSource: "fallback",
    };
  }

  /**
   * Get SIP trunking cost for a specific region
   * @param countryCode - Country code (e.g., 'US', 'CA')
   * @returns Cost per minute for SIP trunking
   */
  private static getSipTrunkingCost(countryCode?: string): number {
    if (!countryCode) {
      return this.BASE_PRICING.sipTrunkingPerMinute;
    }

    const upperCountry = countryCode.toUpperCase();
    return (
      this.REGIONAL_SIP_COSTS[upperCountry] ||
      this.REGIONAL_SIP_COSTS["DEFAULT"]
    );
  }

  /**
   * Round number to 4 decimal places for currency precision
   * @param value - Number to round
   * @returns Rounded number
   */
  private static roundTo4Decimals(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  /**
   * Format cost for display
   * @param cost - Cost amount
   * @param currency - Currency code
   * @returns Formatted cost string
   */
  static formatCost(cost: number, currency: string = "USD"): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(cost);
  }

  /**
   * Get country code from phone number
   * @param phoneNumber - Phone number string
   * @returns Country code or undefined if cannot determine
   */
  static getCountryFromPhoneNumber(phoneNumber: string): string | undefined {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, "");

    // Common country codes
    if (digits.startsWith("1") && digits.length >= 10) return "US"; // US/Canada
    if (digits.startsWith("44")) return "UK"; // United Kingdom
    if (digits.startsWith("49")) return "DE"; // Germany
    if (digits.startsWith("61")) return "AU"; // Australia
    if (digits.startsWith("81")) return "JP"; // Japan
    if (digits.startsWith("91")) return "IN"; // India
    if (digits.startsWith("55")) return "BR"; // Brazil
    if (digits.startsWith("52")) return "MX"; // Mexico

    return undefined; // Unknown country
  }

  /**
   * Calculate total cost for multiple calls
   * @param calls - Array of call costs
   * @returns Total cost breakdown
   */
  static calculateTotalCosts(calls: CallCostBreakdown[]): CallCostBreakdown {
    const total = calls.reduce(
      (acc, call) => ({
        voiceMinutes: acc.voiceMinutes + call.voiceMinutes,
        voiceCost: acc.voiceCost + call.voiceCost,
        sipTrunkingCost: acc.sipTrunkingCost + call.sipTrunkingCost,
        totalCost: acc.totalCost + call.totalCost,
        currency: call.currency,
        pricingSource: call.pricingSource, // Preserve pricing source from first call
      }),
      {
        voiceMinutes: 0,
        voiceCost: 0,
        sipTrunkingCost: 0,
        totalCost: 0,
        currency: "USD",
        pricingSource: "unknown" as const,
      }
    );

    return {
      voiceMinutes: total.voiceMinutes,
      voiceCost: this.roundTo4Decimals(total.voiceCost),
      sipTrunkingCost: this.roundTo4Decimals(total.sipTrunkingCost),
      totalCost: this.roundTo4Decimals(total.totalCost),
      currency: total.currency,
      pricingSource: total.pricingSource,
    };
  }

  /**
   * Test Telnyx API connectivity and authentication
   * @returns Promise<boolean> - true if API is accessible
   */
  static async testTelnyxApiConnection(): Promise<{
    isConnected: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const apiKey = process.env.NEXT_PUBLIC_TELNYX_API_KEY;

      // Enhanced debug logging with more environment context
      const envDebug = {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        apiKeyStart: apiKey?.substring(0, 10) || "undefined",
        nodeEnv: process.env.NODE_ENV,
        allTelnyxVars: Object.keys(process.env).filter((key) =>
          key.includes("TELNYX")
        ),
        isClient: typeof window !== "undefined",
        processType: typeof process,
        envType: typeof process.env,
        buildTime: new Date().toISOString(),
      };

      console.log("Telnyx API Test - Enhanced Environment Check:", envDebug);

      // Check for common environment variable issues
      if (!apiKey) {
        const errorDetails = {
          reason: "Environment variable not found",
          expected: "NEXT_PUBLIC_TELNYX_API_KEY",
          available: Object.keys(process.env).filter((key) =>
            key.startsWith("NEXT_PUBLIC_")
          ),
          environment: process.env.NODE_ENV,
          isClient: typeof window !== "undefined",
        };

        console.error("Telnyx API key not found:", errorDetails);
        return {
          isConnected: false,
          message: "Telnyx API key not configured",
          details: errorDetails,
        };
      }

      if (apiKey.trim() === "") {
        console.warn("Telnyx API key is empty string");
        return {
          isConnected: false,
          message: "Telnyx API key is empty",
          details: {
            reason: "empty_string",
            environment: process.env.NODE_ENV,
          },
        };
      }

      if (apiKey.includes("your_")) {
        console.warn("Telnyx API key contains placeholder text");
        return {
          isConnected: false,
          message: "Telnyx API key contains placeholder text",
          details: {
            reason: "placeholder_detected",
            apiKeyPrefix: apiKey.substring(0, 20),
          },
        };
      }

      console.log(
        "Attempting Telnyx API connection via server-side route with key:",
        apiKey.substring(0, 15) + "..."
      );

      // Use server-side API route to avoid CORS issues
      const apiTestUrl = "/api/telnyx-test";
      console.log("Making request to server-side API route:", apiTestUrl);

      const testResponse = await fetch(apiTestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout for server-side processing
      });

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error("Server-side API route failed:", {
          status: testResponse.status,
          statusText: testResponse.statusText,
          error: errorText,
        });

        return {
          isConnected: false,
          message: `Server-side API route failed: ${testResponse.status} ${testResponse.statusText}`,
          details: {
            status: testResponse.status,
            statusText: testResponse.statusText,
            error: errorText,
            route: apiTestUrl,
            environment: process.env.NODE_ENV,
          },
        };
      }

      const responseData = await testResponse.json();
      console.log("Server-side API route response:", responseData);

      return responseData;
    } catch (error) {
      const errorDetails = {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        method: "server_side_api_route",
      };

      console.error("Telnyx API connection test error:", errorDetails);

      return {
        isConnected: false,
        message: `Telnyx API connection test failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        details: errorDetails,
      };
    }
  }

  /**
   * Get available countries for pricing
   * @returns Promise<string[]> - Array of supported country codes
   */
  static async getAvailableCountries(): Promise<string[]> {
    try {
      const apiKey = process.env.NEXT_PUBLIC_TELNYX_API_KEY;
      if (!apiKey || apiKey.trim() === "" || apiKey.includes("your_")) {
        // Return fallback countries if API key not configured
        return Object.keys(this.REGIONAL_SIP_COSTS).filter(
          (code) => code !== "DEFAULT"
        );
      }

      // Use server-side API route to avoid CORS issues
      const response = await fetch("/api/telnyx-countries", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.countries && Array.isArray(data.countries)) {
          console.log(
            "Countries fetched via server-side route:",
            data.source,
            data.countries.length
          );
          return data.countries;
        }
      }

      // Fallback to hardcoded countries if API call fails
      console.warn(
        "Failed to fetch available countries via server-side route, using fallback"
      );
      return Object.keys(this.REGIONAL_SIP_COSTS).filter(
        (code) => code !== "DEFAULT"
      );
    } catch (error) {
      console.warn(
        "Failed to fetch available countries via server-side route, using fallback:",
        error
      );
      return Object.keys(this.REGIONAL_SIP_COSTS).filter(
        (code) => code !== "DEFAULT"
      );
    }
  }

  /**
   * Clear pricing cache for a specific country or all countries
   * @param countryCode - Optional country code to clear, or undefined to clear all
   */
  static clearPricingCache(countryCode?: string): void {
    if (countryCode) {
      this.pricingCache.delete(countryCode.toUpperCase());
      this.cacheExpiry.delete(countryCode.toUpperCase());
      console.log(`Cleared pricing cache for ${countryCode}`);
    } else {
      this.pricingCache.clear();
      this.cacheExpiry.clear();
      console.log("Cleared all pricing cache");
    }
  }

  /**
   * Get cache statistics
   * @returns Object with cache information
   */
  static getCacheStats(): {
    totalEntries: number;
    activeEntries: number;
    expiredEntries: number;
    cacheHitRate: number;
  } {
    const now = Date.now();
    let activeEntries = 0;
    let expiredEntries = 0;

    const entries = Array.from(this.cacheExpiry.entries());
    for (const [country, expiry] of entries) {
      if (expiry > now) {
        activeEntries++;
      } else {
        expiredEntries++;
      }
    }

    const totalEntries = this.pricingCache.size;
    const cacheHitRate =
      totalEntries > 0 ? (activeEntries / totalEntries) * 100 : 0;

    return {
      totalEntries,
      activeEntries,
      expiredEntries,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Force refresh pricing for a specific country
   * @param countryCode - Country code to refresh
   * @returns Promise<TelnyxApiPricing | null> - Fresh pricing data
   */
  static async forceRefreshPricing(
    countryCode: string
  ): Promise<TelnyxApiPricing | null> {
    // Clear existing cache for this country
    this.clearPricingCache(countryCode);

    // Fetch fresh pricing
    return await this.fetchTelnyxPricing(countryCode);
  }
}
