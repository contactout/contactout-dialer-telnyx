import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TELNYX_API_KEY;

    if (!apiKey || apiKey.trim() === "" || apiKey.includes("your_")) {
      // Return fallback countries if API key not configured
      const fallbackCountries = [
        "US",
        "CA",
        "UK",
        "DE",
        "AU",
        "JP",
        "IN",
        "BR",
        "MX",
      ];
      return NextResponse.json({
        countries: fallbackCountries,
        source: "fallback",
        message: "Using fallback countries - API key not configured",
      });
    }

    // Try to fetch available countries from Telnyx API pricing endpoint
    const response = await fetch("https://api.telnyx.com/v2/pricing", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/csv,application/json",
        "User-Agent": "ContactOut-Dialer/1.0",
      },
    });

    if (response.ok) {
      const csvData = await response.text();

      // Parse CSV data to extract unique country codes
      const lines = csvData.split("\n");
      const countryCodes: string[] = [];

      // Skip header line and process data lines
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          const columns = line.split(",");
          if (columns.length >= 3) {
            const countryCode = columns[2].trim();
            if (
              countryCode &&
              countryCode.length === 3 &&
              /^\d+$/.test(countryCode)
            ) {
              countryCodes.push(countryCode);
            }
          }
        }
      }

      const uniqueCountries = Array.from(new Set(countryCodes));

      console.log(
        "Server-side Telnyx countries fetch - Success:",
        uniqueCountries.length,
        "countries from CSV"
      );

      return NextResponse.json({
        countries: uniqueCountries,
        source: "api_csv",
        message: `Successfully fetched ${uniqueCountries.length} countries from Telnyx API pricing CSV`,
        totalLines: lines.length,
        uniqueCountryCodes: uniqueCountries.length,
      });
    }

    // Fallback to hardcoded countries if API call fails
    const fallbackCountries = [
      "US",
      "CA",
      "UK",
      "DE",
      "AU",
      "JP",
      "IN",
      "BR",
      "MX",
    ];
    console.log(
      "Server-side Telnyx countries fetch - Using fallback countries"
    );

    return NextResponse.json({
      countries: fallbackCountries,
      source: "fallback",
      message: "API call failed, using fallback countries",
    });
  } catch (error) {
    console.error("Server-side Telnyx countries fetch - Error:", error);

    // Fallback to hardcoded countries on error
    const fallbackCountries = [
      "US",
      "CA",
      "UK",
      "DE",
      "AU",
      "JP",
      "IN",
      "BR",
      "MX",
    ];

    return NextResponse.json({
      countries: fallbackCountries,
      source: "fallback",
      message: "Error occurred, using fallback countries",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
