// Error Handling and Logging System
// Provides comprehensive error management, user-friendly messages, and monitoring

export interface ErrorInfo {
  id: string;
  timestamp: Date;
  level: "info" | "warning" | "error" | "critical";
  category:
    | "validation"
    | "network"
    | "audio"
    | "database"
    | "security"
    | "system"
    | "user";
  message: string;
  userMessage: string; // User-friendly version
  details?: any;
  stack?: string;
  userId?: string;
  sessionId?: string;
  context?: Record<string, any>;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface ErrorLog {
  errors: ErrorInfo[];
  stats: {
    totalErrors: number;
    errorsByLevel: Record<string, number>;
    errorsByCategory: Record<string, number>;
    errorsByHour: Record<string, number>;
    averageResolutionTime: number;
  };
}

export interface UserFriendlyError {
  title: string;
  message: string;
  suggestion: string;
  action?: string;
  retry?: boolean;
  helpLink?: string;
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errors: ErrorInfo[] = [];
  private errorCount = 0;
  private maxErrors = 1000; // Keep last 1000 errors
  private sessionId: string;

  private constructor() {
    this.sessionId = this.generateSessionId();
    // Only setup global error handling on the client side
    if (typeof window !== "undefined") {
      this.setupGlobalErrorHandling();
    }
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Setup global error handling
   */
  private setupGlobalErrorHandling(): void {
    // Handle unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      this.logError("Unhandled Promise Rejection", {
        level: "error",
        category: "system",
        details: event.reason,
        context: { type: "unhandledrejection" },
      });
    });

    // Handle global errors
    window.addEventListener("error", (event) => {
      this.logError("Global Error", {
        level: "error",
        category: "system",
        details: event.error,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle console errors
    const originalConsoleError = console.error;
    console.error = (...args) => {
      this.logError("Console Error", {
        level: "error",
        category: "system",
        details: args,
        context: { source: "console.error" },
      });
      originalConsoleError.apply(console, args);
    };
  }

  /**
   * Log an error with comprehensive information
   */
  logError(
    message: string,
    options: {
      level?: "info" | "warning" | "error" | "critical";
      category?:
        | "validation"
        | "network"
        | "audio"
        | "database"
        | "security"
        | "system"
        | "user";
      details?: any;
      userId?: string;
      context?: Record<string, any>;
    } = {}
  ): string {
    const errorId = this.generateErrorId();
    const timestamp = new Date();

    const errorInfo: ErrorInfo = {
      id: errorId,
      timestamp,
      level: options.level || "error",
      category: options.category || "system",
      message,
      userMessage: this.generateUserFriendlyMessage(message, options),
      details: options.details,
      stack: new Error().stack,
      userId: options.userId,
      sessionId: this.sessionId,
      context: options.context,
      resolved: false,
    };

    this.errors.push(errorInfo);
    this.errorCount++;

    // Keep only the last maxErrors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log to console for development
    if (process.env.NODE_ENV === "development") {
      console.group(`🚨 Error: ${message}`);
      console.log("Error ID:", errorId);
      console.log("Level:", errorInfo.level);
      console.log("Category:", errorInfo.category);
      console.log("Details:", errorInfo.details);
      console.log("Context:", errorInfo.context);
      console.log("Stack:", errorInfo.stack);
      console.groupEnd();
    }

    // Send to monitoring service in production
    if (process.env.NODE_ENV === "production") {
      this.sendToMonitoringService(errorInfo);
    }

    return errorId;
  }

  /**
   * Generate user-friendly error message
   */
  private generateUserFriendlyMessage(message: string, options: any): string {
    const errorMap: Record<string, UserFriendlyError> = {
      // Network errors
      "Network error - please check connection": {
        title: "Connection Problem",
        message:
          "Unable to connect to the phone service. Please check your internet connection.",
        suggestion: "Try refreshing the page or check your network settings.",
        retry: true,
      },
      "Telnyx client not initialized": {
        title: "Service Not Ready",
        message:
          "The phone service is still initializing. Please wait a moment.",
        suggestion: "Wait a few seconds and try again.",
        retry: true,
      },
      "Not connected to Telnyx": {
        title: "Service Disconnected",
        message: "Lost connection to the phone service.",
        suggestion: "Please wait while we reconnect automatically.",
        retry: true,
      },

      // Audio errors
      "Microphone access required": {
        title: "Microphone Access Required",
        message: "We need access to your microphone to make calls.",
        suggestion:
          "Click the microphone icon in your browser and allow access.",
        action: "Enable Microphone",
        helpLink: "/help/microphone-setup",
      },
      "Microphone access denied": {
        title: "Microphone Blocked",
        message: "Your browser has blocked microphone access.",
        suggestion:
          "Please allow microphone permissions in your browser settings.",
        action: "Check Permissions",
        helpLink: "/help/microphone-permissions",
      },
      "No microphone found": {
        title: "No Microphone Detected",
        message: "We couldn't find a microphone on your device.",
        suggestion: "Please connect a microphone and try again.",
        action: "Connect Microphone",
      },

      // Validation errors
      "Phone number must be at least 7 digits": {
        title: "Invalid Phone Number",
        message: "The phone number you entered is too short.",
        suggestion: "Please enter a complete phone number with area code.",
        action: "Enter Valid Number",
      },
      "Phone number contains invalid characters": {
        title: "Invalid Characters",
        message: "The phone number contains characters that aren't allowed.",
        suggestion: "Please use only numbers, spaces, dashes, and parentheses.",
        action: "Fix Number Format",
      },

      // Call errors
      "Call failed": {
        title: "Call Failed",
        message: "We couldn't complete your call.",
        suggestion: "Please check the number and try again.",
        retry: true,
      },
      "Number unreachable": {
        title: "Number Unreachable",
        message: "This phone number cannot be reached.",
        suggestion: "Please verify the number is correct and try again.",
        retry: true,
      },
      "Call rejected": {
        title: "Call Rejected",
        message: "The call was rejected by the recipient.",
        suggestion:
          "Try calling again later or check if the number is correct.",
        retry: true,
      },
      "No answer": {
        title: "No Answer",
        message: "The call was not answered.",
        suggestion: "Try calling again or leave a message if available.",
        retry: true,
      },
      "Busy signal": {
        title: "Line Busy",
        message: "The number is currently busy.",
        suggestion: "Try calling again in a few minutes.",
        retry: true,
      },

      // Database errors
      "Database connection failed": {
        title: "Service Temporarily Unavailable",
        message: "We're having trouble saving your call information.",
        suggestion: "Your call will still work, but history may not be saved.",
        retry: true,
      },

      // Security errors
      "Rate limit exceeded": {
        title: "Too Many Requests",
        message: "You've made too many requests. Please wait a moment.",
        suggestion: "Wait a few minutes before trying again.",
        retry: true,
      },
      "Invalid input detected": {
        title: "Invalid Input",
        message: "The information you entered contains invalid characters.",
        suggestion: "Please check your input and try again.",
        action: "Review Input",
      },
    };

    // Try to find a specific error message
    for (const [key, userError] of Object.entries(errorMap)) {
      if (message.includes(key) || key.includes(message)) {
        return userError.message;
      }
    }

    // Fallback to generic message
    return "Something went wrong. Please try again or contact support if the problem persists.";
  }

  /**
   * Get user-friendly error information
   */
  getUserFriendlyError(message: string): UserFriendlyError {
    const errorMap: Record<string, UserFriendlyError> = {
      // Network errors
      "Network error - please check connection": {
        title: "Connection Problem",
        message:
          "Unable to connect to the phone service. Please check your internet connection.",
        suggestion: "Try refreshing the page or check your network settings.",
        retry: true,
      },
      "Telnyx client not initialized": {
        title: "Service Not Ready",
        message:
          "The phone service is still initializing. Please wait a moment.",
        suggestion: "Wait a few seconds and try again.",
        retry: true,
      },
      "Not connected to Telnyx": {
        title: "Service Disconnected",
        message: "Lost connection to the phone service.",
        suggestion: "Please wait while we reconnect automatically.",
        retry: true,
      },

      // Audio errors
      "Microphone access required": {
        title: "Microphone Access Required",
        message: "We need access to your microphone to make calls.",
        suggestion:
          "Click the microphone icon in your browser and allow access.",
        action: "Enable Microphone",
        helpLink: "/help/microphone-setup",
      },
      "Microphone access denied": {
        title: "Microphone Blocked",
        message: "Your browser has blocked microphone access.",
        suggestion:
          "Please allow microphone permissions in your browser settings.",
        action: "Check Permissions",
        helpLink: "/help/microphone-permissions",
      },
      "No microphone found": {
        title: "No Microphone Detected",
        message: "We couldn't find a microphone on your device.",
        suggestion: "Please connect a microphone and try again.",
        action: "Connect Microphone",
      },

      // Validation errors
      "Phone number must be at least 7 digits": {
        title: "Invalid Phone Number",
        message: "The phone number you entered is too short.",
        suggestion: "Please enter a complete phone number with area code.",
        action: "Enter Valid Number",
      },
      "Phone number contains invalid characters": {
        title: "Invalid Characters",
        message: "The phone number contains characters that aren't allowed.",
        suggestion: "Please use only numbers, spaces, dashes, and parentheses.",
        action: "Fix Number Format",
      },

      // Call errors
      "Call failed": {
        title: "Call Failed",
        message: "We couldn't complete your call.",
        suggestion: "Please check the number and try again.",
        retry: true,
      },
      "Number unreachable": {
        title: "Number Unreachable",
        message: "This phone number cannot be reached.",
        suggestion: "Please verify the number is correct and try again.",
        retry: true,
      },
      "Call rejected": {
        title: "Call Rejected",
        message: "The call was rejected by the recipient.",
        suggestion:
          "Try calling again later or check if the number is correct.",
        retry: true,
      },
      "No answer": {
        title: "No Answer",
        message: "The call was not answered.",
        suggestion: "Try calling again or leave a message if available.",
        retry: true,
      },
      "Busy signal": {
        title: "Line Busy",
        message: "The number is currently busy.",
        suggestion: "Try calling again in a few minutes.",
        retry: true,
      },

      // Database errors
      "Database connection failed": {
        title: "Service Temporarily Unavailable",
        message: "We're having trouble saving your call information.",
        suggestion: "Your call will still work, but history may not be saved.",
        retry: true,
      },

      // Security errors
      "Rate limit exceeded": {
        title: "Too Many Requests",
        message: "You've made too many requests. Please wait a moment.",
        suggestion: "Wait a few minutes before trying again.",
        retry: true,
      },
      "Invalid input detected": {
        title: "Invalid Input",
        message: "The information you entered contains invalid characters.",
        suggestion: "Please check your input and try again.",
        action: "Review Input",
      },
    };

    // Try to find a specific error message
    for (const [key, userError] of Object.entries(errorMap)) {
      if (message.includes(key) || key.includes(message)) {
        return userError;
      }
    }

    // Fallback to generic error
    return {
      title: "Unexpected Error",
      message: "Something went wrong. Please try again.",
      suggestion: "If the problem persists, please contact support.",
      retry: true,
    };
  }

  /**
   * Mark an error as resolved
   */
  resolveError(errorId: string, resolvedBy?: string): boolean {
    const error = this.errors.find((e) => e.id === errorId);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date();
      error.resolvedBy = resolvedBy;
      return true;
    }
    return false;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByLevel: Record<string, number>;
    errorsByCategory: Record<string, number>;
    errorsByHour: Record<string, number>;
    averageResolutionTime: number;
    unresolvedErrors: number;
  } {
    const now = new Date();
    const stats = {
      totalErrors: this.errors.length,
      errorsByLevel: {} as Record<string, number>,
      errorsByCategory: {} as Record<string, number>,
      errorsByHour: {} as Record<string, number>,
      averageResolutionTime: 0,
      unresolvedErrors: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    this.errors.forEach((error) => {
      // Count by level
      stats.errorsByLevel[error.level] =
        (stats.errorsByLevel[error.level] || 0) + 1;

      // Count by category
      stats.errorsByCategory[error.category] =
        (stats.errorsByCategory[error.category] || 0) + 1;

      // Count by hour
      const hour = error.timestamp.getHours().toString().padStart(2, "0");
      stats.errorsByHour[hour] = (stats.errorsByHour[hour] || 0) + 1;

      // Count unresolved
      if (!error.resolved) {
        stats.unresolvedErrors++;
      } else if (error.resolvedAt) {
        // Calculate resolution time
        const resolutionTime =
          error.resolvedAt.getTime() - error.timestamp.getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }
    });

    // Calculate average resolution time
    if (resolvedCount > 0) {
      stats.averageResolutionTime = totalResolutionTime / resolvedCount;
    }

    return stats;
  }

  /**
   * Get errors with filtering
   */
  getErrors(filter?: {
    level?: string[];
    category?: string[];
    resolved?: boolean;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }): ErrorInfo[] {
    let filteredErrors = [...this.errors];

    if (filter?.level && filter.level.length > 0) {
      filteredErrors = filteredErrors.filter((e) =>
        filter.level!.includes(e.level)
      );
    }

    if (filter?.category && filter.category.length > 0) {
      filteredErrors = filteredErrors.filter((e) =>
        filter.category!.includes(e.category)
      );
    }

    if (filter?.resolved !== undefined) {
      filteredErrors = filteredErrors.filter(
        (e) => e.resolved === filter.resolved
      );
    }

    if (filter?.userId) {
      filteredErrors = filteredErrors.filter((e) => e.userId === filter.userId);
    }

    if (filter?.startDate) {
      filteredErrors = filteredErrors.filter(
        (e) => e.timestamp >= filter.startDate!
      );
    }

    if (filter?.endDate) {
      filteredErrors = filteredErrors.filter(
        (e) => e.timestamp <= filter.endDate!
      );
    }

    return filteredErrors.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Clear old errors
   */
  clearOldErrors(olderThanDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const initialCount = this.errors.length;
    this.errors = this.errors.filter((error) => error.timestamp >= cutoffDate);

    return initialCount - this.errors.length;
  }

  /**
   * Export errors to JSON
   */
  exportErrors(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        sessionId: this.sessionId,
        errors: this.errors,
      },
      null,
      2
    );
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${this.errorCount}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send error to monitoring service (production)
   */
  private sendToMonitoringService(errorInfo: ErrorInfo): void {
    // In production, this would send to services like:
    // - Sentry
    // - LogRocket
    // - DataDog
    // - Custom monitoring service

    try {
      // Example: Send to custom endpoint
      fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(errorInfo),
      }).catch(() => {
        // Silently fail if monitoring service is unavailable
      });
    } catch {
      // Silently fail if fetch is not available
    }
  }

  /**
   * Get error trends for monitoring
   */
  getErrorTrends(hours: number = 24): {
    errorsByHour: Record<string, number>;
    errorRate: number;
    criticalErrors: number;
    trend: "increasing" | "decreasing" | "stable";
  } {
    const now = new Date();
    const cutoffTime = now.getTime() - hours * 60 * 60 * 1000;

    const recentErrors = this.errors.filter(
      (e) => e.timestamp.getTime() >= cutoffTime
    );
    const previousPeriodErrors = this.errors.filter((e) => {
      const time = e.timestamp.getTime();
      return time >= cutoffTime - hours * 60 * 60 * 1000 && time < cutoffTime;
    });

    // Group by hour
    const errorsByHour: Record<string, number> = {};
    recentErrors.forEach((error) => {
      const hour = error.timestamp.getHours().toString().padStart(2, "0");
      errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
    });

    // Calculate error rate (errors per hour)
    const errorRate = recentErrors.length / hours;

    // Count critical errors
    const criticalErrors = recentErrors.filter(
      (e) => e.level === "critical"
    ).length;

    // Determine trend
    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (recentErrors.length > previousPeriodErrors.length * 1.2) {
      trend = "increasing";
    } else if (recentErrors.length < previousPeriodErrors.length * 0.8) {
      trend = "decreasing";
    }

    return {
      errorsByHour,
      errorRate,
      criticalErrors,
      trend,
    };
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Export convenience functions
export const logError = (message: string, options?: any) =>
  errorHandler.logError(message, options);
export const getUserFriendlyError = (message: string) =>
  errorHandler.getUserFriendlyError(message);
export const resolveError = (errorId: string, resolvedBy?: string) =>
  errorHandler.resolveError(errorId, resolvedBy);
