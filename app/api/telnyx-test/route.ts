import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_TELNYX_API_KEY;

    if (!apiKey || apiKey.trim() === "" || apiKey.includes("your_")) {
      return NextResponse.json(
        {
          isConnected: false,
          message: "Telnyx API key not configured",
          details: {
            reason: "missing_or_invalid_key",
            hasApiKey: !!apiKey,
            isEmpty: !apiKey?.trim(),
            containsPlaceholder: apiKey?.includes("your_"),
          },
        },
        { status: 400 }
      );
    }

    // Test with a different pricing endpoint
    const testUrl = "https://api.telnyx.com/v2/pricing";
    const testHeaders = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "ContactOut-Dialer/1.0",
    };

    console.log("Server-side Telnyx API test - Making request to:", testUrl);
    console.log(
      "Server-side Telnyx API test - API Key prefix:",
      apiKey.substring(0, 15) + "..."
    );

    const testResponse = await fetch(testUrl, {
      method: "GET",
      headers: testHeaders,
      // No timeout needed on server-side
    });

    const responseInfo = {
      status: testResponse.status,
      statusText: testResponse.statusText,
      ok: testResponse.ok,
      headers: Object.fromEntries(testResponse.headers.entries()),
      contentType: testResponse.headers.get("content-type"),
    };

    console.log("Server-side Telnyx API test - Response:", responseInfo);

    if (testResponse.ok) {
      // Check content type to handle different response formats
      const contentType = testResponse.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          const responseData = await testResponse.json();
          console.log(
            "Server-side Telnyx API test - JSON Success:",
            responseData
          );

          return NextResponse.json({
            isConnected: true,
            message: "Telnyx API connection successful - JSON response",
            details: {
              ...responseInfo,
              responseData: responseData,
              apiKeyValid: true,
              environment: process.env.NODE_ENV,
              serverSide: true,
              responseFormat: "json",
            },
          });
        } catch (jsonError) {
          console.error("Failed to parse JSON response:", jsonError);
        }
      } else if (
        contentType.includes("text/csv") ||
        contentType.includes("text/plain")
      ) {
        // Handle CSV or plain text responses
        const responseText = await testResponse.text();
        console.log(
          "Server-side Telnyx API test - Text/CSV Success (first 200 chars):",
          responseText.substring(0, 200)
        );

        return NextResponse.json({
          isConnected: true,
          message: "Telnyx API connection successful - Text/CSV response",
          details: {
            ...responseInfo,
            responseData: responseText.substring(0, 500), // First 500 chars
            apiKeyValid: true,
            environment: process.env.NODE_ENV,
            serverSide: true,
            responseFormat: "text/csv",
            fullResponseLength: responseText.length,
          },
        });
      } else {
        // Handle other response types
        const responseText = await testResponse.text();
        console.log(
          "Server-side Telnyx API test - Other format Success (first 200 chars):",
          responseText.substring(0, 200)
        );

        return NextResponse.json({
          isConnected: true,
          message: "Telnyx API connection successful - Other format response",
          details: {
            ...responseInfo,
            responseData: responseText.substring(0, 500), // First 500 chars
            apiKeyValid: true,
            environment: process.env.NODE_ENV,
            serverSide: true,
            responseFormat: contentType,
            fullResponseLength: responseText.length,
          },
        });
      }
    } else {
      let errorText = "";
      try {
        errorText = await testResponse.text();
      } catch (readError) {
        errorText = "Could not read error response";
      }

      const errorDetails = {
        ...responseInfo,
        error: errorText,
        apiKeyPrefix: apiKey.substring(0, 15),
        environment: process.env.NODE_ENV,
        url: testUrl,
        serverSide: true,
      };

      console.error("Server-side Telnyx API test - Failed:", errorDetails);

      return NextResponse.json(
        {
          isConnected: false,
          message: `Telnyx API test failed: ${testResponse.status} ${testResponse.statusText}`,
          details: errorDetails,
        },
        { status: testResponse.status }
      );
    }
  } catch (error) {
    const errorDetails = {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Error ? error.constructor.name : typeof error,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      serverSide: true,
    };

    console.error("Server-side Telnyx API test - Error:", errorDetails);

    return NextResponse.json(
      {
        isConnected: false,
        message: `Telnyx API connection test failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}
