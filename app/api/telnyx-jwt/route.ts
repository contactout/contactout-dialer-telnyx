import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return await generateJWT();
}

export async function POST(request: NextRequest) {
  return await generateJWT();
}

async function generateJWT() {
  try {
    const apiKey = process.env.TELNYX_API_KEY;
    const credentialId = process.env.TELNYX_CREDENTIAL_ID;

    console.log("🔍 Environment check:", {
      hasApiKey: !!apiKey,
      hasCredentialId: !!credentialId,
      apiKeyLength: apiKey?.length,
      credentialIdLength: credentialId?.length,
    });

    if (!apiKey || !credentialId) {
      console.error("❌ Telnyx credentials not configured:", {
        hasApiKey: !!apiKey,
        hasCredentialId: !!credentialId,
      });
      return NextResponse.json(
        { error: "Telnyx credentials not configured" },
        { status: 500 }
      );
    }

    console.log("🔑 Generating JWT token for credential:", credentialId);
    console.log("🔑 API Key prefix:", apiKey.substring(0, 10) + "...");

    const url = `https://api.telnyx.com/v2/telephony_credentials/${credentialId}/token`;
    console.log("🔑 Request URL:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}), // Add empty body
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Telnyx API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Telnyx API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const jwtToken = await response.text();
    console.log("✅ JWT token generated successfully");

    return NextResponse.json({ jwt: jwtToken });
  } catch (error) {
    console.error("❌ JWT generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate JWT token" },
      { status: 500 }
    );
  }
}
