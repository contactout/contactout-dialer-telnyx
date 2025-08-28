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
}
