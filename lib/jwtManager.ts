interface JWTToken {
  token: string;
  expiresAt: number;
}

class JWTManager {
  private token: JWTToken | null = null;
  private refreshPromise: Promise<string> | null = null;
  private lastError: Error | null = null;
  private retryCount = 0;
  private maxRetries = 3;

  async getToken(): Promise<string> {
    // Check if we've exceeded retry limit
    if (this.retryCount >= this.maxRetries && this.lastError) {
      console.error(
        "❌ JWT generation failed after max retries, throwing last error"
      );
      throw this.lastError;
    }

    // Return cached token if still valid (with 5-minute buffer)
    if (this.token && Date.now() < this.token.expiresAt - 300000) {
      console.log("🔄 Using cached JWT token");
      return this.token.token;
    }

    // If already refreshing, wait for that to complete
    if (this.refreshPromise) {
      console.log("⏳ Waiting for JWT token refresh...");
      return this.refreshPromise;
    }

    // Generate new token
    console.log("🔄 Generating new JWT token...");
    this.refreshPromise = this.generateNewToken();
    const token = await this.refreshPromise;
    this.refreshPromise = null;
    return token;
  }

  private async generateNewToken(): Promise<string> {
    try {
      const response = await fetch("/api/telnyx-jwt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        const error = new Error(`JWT generation failed: ${errorData.error}`);
        this.lastError = error;
        this.retryCount++;
        throw error;
      }

      const { jwt } = await response.json();

      // Reset retry count on success
      this.retryCount = 0;
      this.lastError = null;

      // Cache token with 23-hour expiration (1 hour buffer)
      this.token = {
        token: jwt,
        expiresAt: Date.now() + 23 * 60 * 60 * 1000,
      };

      console.log("✅ JWT token generated and cached");
      return jwt;
    } catch (error) {
      console.error("❌ JWT generation failed:", error);
      this.lastError = error as Error;
      this.retryCount++;
      throw error;
    }
  }

  // Method to clear cached token (useful for testing or forced refresh)
  clearToken(): void {
    this.token = null;
    this.refreshPromise = null;
    this.retryCount = 0;
    this.lastError = null;
    console.log("🗑️ JWT token cache cleared");
  }

  // Method to reset retry count (useful when credentials are updated)
  resetRetryCount(): void {
    this.retryCount = 0;
    this.lastError = null;
    console.log("🔄 JWT retry count reset");
  }

  // Method to check if token is cached and valid
  hasValidToken(): boolean {
    return this.token !== null && Date.now() < this.token.expiresAt - 300000;
  }
}

export const jwtManager = new JWTManager();
