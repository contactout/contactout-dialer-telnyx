// Security and Input Validation System
// Provides comprehensive protection against common security vulnerabilities

export interface SecurityConfig {
  maxPhoneNumberLength: number;
  maxInputLength: number;
  rateLimitWindow: number; // milliseconds
  maxRequestsPerWindow: number;
  allowedPhoneNumberPatterns: RegExp[];
  blockedPatterns: RegExp[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue: string;
  riskLevel: "low" | "medium" | "high";
}

export interface RateLimitInfo {
  isAllowed: boolean;
  remainingRequests: number;
  resetTime: number;
  retryAfter: number;
}

export class SecurityManager {
  private static instance: SecurityManager;
  private rateLimitStore = new Map<
    string,
    { count: number; resetTime: number }
  >();

  private defaultConfig: SecurityConfig = {
    maxPhoneNumberLength: 20,
    maxInputLength: 1000,
    rateLimitWindow: 60000, // 1 minute
    maxRequestsPerWindow: 100,
    allowedPhoneNumberPatterns: [
      /^\+?[\d\s\-\(\)]+$/, // Basic phone number pattern
      /^[\d\s\-\(\)]+$/, // Local format
    ],
    blockedPatterns: [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
      /javascript:/gi, // JavaScript protocol
      /on\w+\s*=/gi, // Event handlers
      /data:text\/html/gi, // Data URLs
      /vbscript:/gi, // VBScript
      /<iframe/gi, // Iframes
      /<object/gi, // Objects
      /<embed/gi, // Embeds
      /<form/gi, // Forms
      /<input/gi, // Input fields
      /<textarea/gi, // Textareas
      /<select/gi, // Select fields
      /<button/gi, // Buttons
      /<link/gi, // Link tags
      /<meta/gi, // Meta tags
      /<style/gi, // Style tags
      /<title/gi, // Title tags
      /<head/gi, // Head tags
      /<body/gi, // Body tags
      /<html/gi, // HTML tags
    ],
  };

  private constructor() {}

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  /**
   * Sanitize input to prevent XSS attacks
   */
  sanitizeInput(input: string): string {
    if (!input || typeof input !== "string") return "";

    let sanitized = input;

    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, "");

    // Encode special characters
    sanitized = sanitized
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");

    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

    return sanitized;
  }

  /**
   * Validate and sanitize phone number input
   */
  validatePhoneNumber(input: string): ValidationResult {
    const errors: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "low";

    // Check for null/undefined
    if (!input) {
      errors.push("Phone number is required");
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check input type
    if (typeof input !== "string") {
      errors.push("Phone number must be a string");
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check length
    if (input.length > this.defaultConfig.maxPhoneNumberLength) {
      errors.push(
        `Phone number too long (max ${this.defaultConfig.maxPhoneNumberLength} characters)`
      );
      riskLevel = "medium";
    }

    // Check for blocked patterns
    for (const pattern of this.defaultConfig.blockedPatterns) {
      if (pattern.test(input)) {
        errors.push("Phone number contains invalid characters or patterns");
        riskLevel = "high";
        break;
      }
    }

    // Check for allowed patterns
    const hasValidPattern = this.defaultConfig.allowedPhoneNumberPatterns.some(
      (pattern) => pattern.test(input)
    );

    if (!hasValidPattern) {
      errors.push("Phone number format is not valid");
      riskLevel = "medium";
    }

    // Check for suspicious patterns
    if (this.detectSuspiciousPatterns(input)) {
      errors.push("Phone number contains suspicious patterns");
      riskLevel = "high";
    }

    // Sanitize input
    const sanitizedValue = this.sanitizeInput(input);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
      riskLevel,
    };
  }

  /**
   * Detect suspicious patterns in input
   */
  private detectSuspiciousPatterns(input: string): boolean {
    const suspiciousPatterns = [
      /[<>]/, // HTML tags
      /javascript:/i, // JavaScript protocol
      /data:/i, // Data URLs
      /vbscript:/i, // VBScript
      /on\w+\s*=/i, // Event handlers
      /<script/i, // Script tags
      /<iframe/i, // Iframe tags
      /<object/i, // Object tags
      /<embed/i, // Embed tags
      /<form/i, // Form tags
      /<input/i, // Input tags
      /<textarea/i, // Textarea tags
      /<select/i, // Select tags
      /<button/i, // Button tags
      /<link/i, // Link tags
      /<meta/i, // Meta tags
      /<style/i, // Style tags
      /<title/i, // Title tags
      /<head/i, // Head tags
      /<body/i, // Body tags
      /<html/i, // HTML tags
      /[^\x20-\x7E]/, // Non-printable characters
      /\x00/, // Null bytes
      /[\x01-\x1F]/, // Control characters
      /\x7F/, // Delete character
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Validate general text input
   */
  validateTextInput(
    input: string,
    fieldName: string,
    maxLength?: number
  ): ValidationResult {
    const errors: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "low";

    // Check for null/undefined
    if (!input) {
      errors.push(`${fieldName} is required`);
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check input type
    if (typeof input !== "string") {
      errors.push(`${fieldName} must be a string`);
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check length
    const maxLen = maxLength || this.defaultConfig.maxInputLength;
    if (input.length > maxLen) {
      errors.push(`${fieldName} too long (max ${maxLen} characters)`);
      riskLevel = "medium";
    }

    // Check for blocked patterns
    for (const pattern of this.defaultConfig.blockedPatterns) {
      if (pattern.test(input)) {
        errors.push(`${fieldName} contains invalid characters or patterns`);
        riskLevel = "high";
        break;
      }
    }

    // Check for suspicious patterns
    if (this.detectSuspiciousPatterns(input)) {
      errors.push(`${fieldName} contains suspicious patterns`);
      riskLevel = "high";
    }

    // Sanitize input
    const sanitizedValue = this.sanitizeInput(input);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
      riskLevel,
    };
  }

  /**
   * Check rate limiting for a specific identifier
   */
  checkRateLimit(identifier: string): RateLimitInfo {
    const now = Date.now();
    const windowStart = now - this.defaultConfig.rateLimitWindow;

    // Get current rate limit info
    const current = this.rateLimitStore.get(identifier);

    if (!current || current.resetTime < now) {
      // Reset rate limit window
      this.rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + this.defaultConfig.rateLimitWindow,
      });

      return {
        isAllowed: true,
        remainingRequests: this.defaultConfig.maxRequestsPerWindow - 1,
        resetTime: now + this.defaultConfig.rateLimitWindow,
        retryAfter: 0,
      };
    }

    // Check if within rate limit
    if (current.count >= this.defaultConfig.maxRequestsPerWindow) {
      return {
        isAllowed: false,
        remainingRequests: 0,
        resetTime: current.resetTime,
        retryAfter: current.resetTime - now,
      };
    }

    // Increment count
    current.count++;
    this.rateLimitStore.set(identifier, current);

    return {
      isAllowed: true,
      remainingRequests:
        this.defaultConfig.maxRequestsPerWindow - current.count,
      resetTime: current.resetTime,
      retryAfter: 0,
    };
  }

  /**
   * Validate email address format and security
   */
  validateEmail(email: string): ValidationResult {
    const errors: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "low";

    // Check for null/undefined
    if (!email) {
      errors.push("Email address is required");
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check input type
    if (typeof email !== "string") {
      errors.push("Email address must be a string");
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Check length
    if (email.length > 254) {
      // RFC 5321 limit
      errors.push("Email address too long (max 254 characters)");
      riskLevel = "medium";
    }

    // Check for blocked patterns
    for (const pattern of this.defaultConfig.blockedPatterns) {
      if (pattern.test(email)) {
        errors.push("Email address contains invalid characters or patterns");
        riskLevel = "high";
        break;
      }
    }

    // Basic email format validation
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!emailRegex.test(email)) {
      errors.push("Email address format is not valid");
      riskLevel = "medium";
    }

    // Check for suspicious patterns
    if (this.detectSuspiciousPatterns(email)) {
      errors.push("Email address contains suspicious patterns");
      riskLevel = "high";
    }

    // Sanitize input
    const sanitizedValue = this.sanitizeInput(email);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
      riskLevel,
    };
  }

  /**
   * Validate numeric input
   */
  validateNumericInput(
    input: string | number,
    fieldName: string,
    min?: number,
    max?: number
  ): ValidationResult {
    const errors: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "low";

    // Check for null/undefined
    if (input === null || input === undefined) {
      errors.push(`${fieldName} is required`);
      return {
        isValid: false,
        errors,
        sanitizedValue: "",
        riskLevel: "high",
      };
    }

    // Convert to number if string
    let numericValue: number;
    if (typeof input === "string") {
      numericValue = parseFloat(input);
      if (isNaN(numericValue)) {
        errors.push(`${fieldName} must be a valid number`);
        riskLevel = "medium";
      }
    } else {
      numericValue = input;
    }

    // Check range
    if (min !== undefined && numericValue < min) {
      errors.push(`${fieldName} must be at least ${min}`);
      riskLevel = "medium";
    }

    if (max !== undefined && numericValue > max) {
      errors.push(`${fieldName} must be at most ${max}`);
      riskLevel = "medium";
    }

    // Check for suspicious patterns in string input
    if (typeof input === "string" && this.detectSuspiciousPatterns(input)) {
      errors.push(`${fieldName} contains suspicious patterns`);
      riskLevel = "high";
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue: numericValue.toString(),
      riskLevel,
    };
  }

  /**
   * Generate secure random string
   */
  generateSecureToken(length: number = 32): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    // Use crypto.getRandomValues if available, fallback to Math.random
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);

      for (let i = 0; i < length; i++) {
        result += chars.charAt(array[i] % chars.length);
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    return result;
  }

  /**
   * Hash sensitive data (basic implementation)
   */
  hashData(data: string): string {
    // In production, use a proper hashing library like bcrypt or crypto-js
    // This is a basic implementation for demonstration
    let hash = 0;
    if (data.length === 0) return hash.toString();

    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Clean up rate limit store (remove expired entries)
   */
  cleanupRateLimitStore(): void {
    const now = Date.now();
    const entries = Array.from(this.rateLimitStore.entries());
    for (const [identifier, data] of entries) {
      if (data.resetTime < now) {
        this.rateLimitStore.delete(identifier);
      }
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalRateLimitEntries: number;
    activeRateLimitEntries: number;
    blockedRequests: number;
  } {
    const now = Date.now();
    let activeEntries = 0;
    let blockedRequests = 0;

    const entries = Array.from(this.rateLimitStore.values());
    for (const data of entries) {
      if (data.resetTime >= now) {
        activeEntries++;
        if (data.count >= this.defaultConfig.maxRequestsPerWindow) {
          blockedRequests++;
        }
      }
    }

    return {
      totalRateLimitEntries: this.rateLimitStore.size,
      activeRateLimitEntries: activeEntries,
      blockedRequests,
    };
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...newConfig };
  }

  /**
   * Reset rate limit for a specific identifier
   */
  resetRateLimit(identifier: string): void {
    this.rateLimitStore.delete(identifier);
  }

  /**
   * Clear all rate limits
   */
  clearAllRateLimits(): void {
    this.rateLimitStore.clear();
  }
}

// Export singleton instance
export const securityManager = SecurityManager.getInstance();
