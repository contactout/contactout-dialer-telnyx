// Call Analytics and Reporting System
// Provides comprehensive insights into call performance, success rates, and trends

export interface CallMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  missedCalls: number;
  incomingCalls: number;
  totalDuration: number; // in seconds
  averageDuration: number; // in seconds
  successRate: number; // percentage
  totalCost: number;
  averageCost: number;
  date?: string; // For trends data
}

export interface CallTrends {
  daily: CallMetrics[];
  weekly: CallMetrics[];
  monthly: CallMetrics[];
  hourly: CallMetrics[];
}

export interface CallPerformance {
  userId: string;
  metrics: CallMetrics;
  trends: CallTrends;
  topNumbers: Array<{
    phoneNumber: string;
    callCount: number;
    successRate: number;
    totalDuration: number;
  }>;
  callQuality: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}

export interface CallReport {
  period: "day" | "week" | "month" | "year";
  startDate: Date;
  endDate: Date;
  metrics: CallMetrics;
  trends: CallTrends;
  insights: string[];
  recommendations: string[];
}

export interface CallFilter {
  startDate?: Date;
  endDate?: Date;
  status?: string[];
  userId?: string;
  countryCode?: string;
  minDuration?: number;
  maxDuration?: number;
  minCost?: number;
  maxCost?: number;
}

export class CallAnalytics {
  /**
   * Calculate comprehensive call metrics
   */
  static calculateMetrics(calls: any[]): CallMetrics {
    if (!calls || calls.length === 0) {
      return {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        missedCalls: 0,
        incomingCalls: 0,
        totalDuration: 0,
        averageDuration: 0,
        successRate: 0,
        totalCost: 0,
        averageCost: 0,
      };
    }

    const metrics = calls.reduce(
      (acc, call) => {
        acc.totalCalls++;

        switch (call.status) {
          case "completed":
            acc.successfulCalls++;
            break;
          case "failed":
            acc.failedCalls++;
            break;
          case "missed":
            acc.missedCalls++;
            break;
          case "incoming":
            acc.incomingCalls++;
            break;
        }

        if (call.duration) {
          acc.totalDuration += call.duration;
        }

        if (call.total_cost) {
          acc.totalCost += parseFloat(call.total_cost);
        }

        return acc;
      },
      {
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        missedCalls: 0,
        incomingCalls: 0,
        totalDuration: 0,
        totalCost: 0,
      }
    );

    return {
      ...metrics,
      averageDuration:
        metrics.totalCalls > 0 ? metrics.totalDuration / metrics.totalCalls : 0,
      successRate:
        metrics.totalCalls > 0
          ? (metrics.successfulCalls / metrics.totalCalls) * 100
          : 0,
      averageCost:
        metrics.totalCalls > 0 ? metrics.totalCost / metrics.totalCalls : 0,
    };
  }

  /**
   * Generate call trends by time period
   */
  static generateTrends(
    calls: any[],
    period: "daily" | "weekly" | "monthly" | "hourly"
  ): CallTrends {
    const now = new Date();
    const trends: CallTrends = {
      daily: [],
      weekly: [],
      monthly: [],
      hourly: [],
    };

    // Group calls by time period
    const groupedCalls = this.groupCallsByPeriod(calls, period);

    // Calculate metrics for each period
    Object.entries(groupedCalls).forEach(([periodKey, periodCalls]) => {
      const metrics = this.calculateMetrics(periodCalls);
      const periodData = {
        ...metrics,
        date: periodKey,
      };

      switch (period) {
        case "daily":
          trends.daily.push(periodData);
          break;
        case "weekly":
          trends.weekly.push(periodData);
          break;
        case "monthly":
          trends.monthly.push(periodData);
          break;
        case "hourly":
          trends.hourly.push(periodData);
          break;
      }
    });

    return trends;
  }

  /**
   * Group calls by time period for trend analysis
   */
  private static groupCallsByPeriod(
    calls: any[],
    period: "daily" | "weekly" | "monthly" | "hourly"
  ): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    calls.forEach((call) => {
      const callDate = new Date(call.timestamp);
      let periodKey: string;

      switch (period) {
        case "daily":
          periodKey = callDate.toISOString().split("T")[0]; // YYYY-MM-DD
          break;
        case "weekly":
          const weekStart = new Date(callDate);
          weekStart.setDate(callDate.getDate() - callDate.getDay());
          periodKey = weekStart.toISOString().split("T")[0];
          break;
        case "monthly":
          periodKey = `${callDate.getFullYear()}-${String(
            callDate.getMonth() + 1
          ).padStart(2, "0")}`;
          break;
        case "hourly":
          periodKey = `${callDate.toISOString().split("T")[0]}T${String(
            callDate.getHours()
          ).padStart(2, "0")}:00`;
          break;
        default:
          periodKey = callDate.toISOString().split("T")[0];
      }

      if (!grouped[periodKey]) {
        grouped[periodKey] = [];
      }
      grouped[periodKey].push(call);
    });

    return grouped;
  }

  /**
   * Analyze call performance for a specific user
   */
  static analyzeUserPerformance(calls: any[], userId: string): CallPerformance {
    const userCalls = calls.filter((call) => call.user_id === userId);
    const metrics = this.calculateMetrics(userCalls);
    const trends = this.generateTrends(userCalls, "daily");

    // Top called numbers
    const numberStats = this.analyzeTopNumbers(userCalls);

    // Call quality analysis (if available)
    const callQuality = this.analyzeCallQuality(userCalls);

    return {
      userId,
      metrics,
      trends,
      topNumbers: numberStats,
      callQuality,
    };
  }

  /**
   * Analyze top called numbers
   */
  private static analyzeTopNumbers(calls: any[]): Array<{
    phoneNumber: string;
    callCount: number;
    successRate: number;
    totalDuration: number;
  }> {
    const numberMap = new Map<
      string,
      {
        callCount: number;
        successfulCalls: number;
        totalDuration: number;
      }
    >();

    calls.forEach((call) => {
      const number = call.phone_number;
      if (!numberMap.has(number)) {
        numberMap.set(number, {
          callCount: 0,
          successfulCalls: 0,
          totalDuration: 0,
        });
      }

      const stats = numberMap.get(number)!;
      stats.callCount++;

      if (call.status === "completed") {
        stats.successfulCalls++;
      }

      if (call.duration) {
        stats.totalDuration += call.duration;
      }
    });

    return Array.from(numberMap.entries())
      .map(([phoneNumber, stats]) => ({
        phoneNumber,
        callCount: stats.callCount,
        successRate: (stats.successfulCalls / stats.callCount) * 100,
        totalDuration: stats.totalDuration,
      }))
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 10); // Top 10
  }

  /**
   * Analyze call quality metrics
   */
  private static analyzeCallQuality(calls: any[]): {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  } {
    // This would integrate with actual call quality data
    // For now, we'll use duration as a proxy for quality
    const quality = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    };

    calls.forEach((call) => {
      if (call.duration) {
        if (call.duration > 300) {
          // > 5 minutes
          quality.excellent++;
        } else if (call.duration > 120) {
          // > 2 minutes
          quality.good++;
        } else if (call.duration > 30) {
          // > 30 seconds
          quality.fair++;
        } else {
          quality.poor++;
        }
      }
    });

    return quality;
  }

  /**
   * Generate insights from call data
   */
  static generateInsights(metrics: CallMetrics, trends: CallTrends): string[] {
    const insights: string[] = [];

    // Success rate insights
    if (metrics.successRate < 50) {
      insights.push(
        "Low call success rate detected. Consider reviewing dialing patterns or number validation."
      );
    } else if (metrics.successRate > 90) {
      insights.push(
        "Excellent call success rate! Your dialing strategy is working well."
      );
    }

    // Duration insights
    if (metrics.averageDuration < 30) {
      insights.push(
        "Calls are very short on average. This might indicate quick rejections or invalid numbers."
      );
    } else if (metrics.averageDuration > 300) {
      insights.push(
        "Long average call duration suggests high engagement and quality conversations."
      );
    }

    // Cost insights
    if (metrics.averageCost > 0.05) {
      insights.push(
        "High average call cost detected. Consider reviewing international calling patterns."
      );
    }

    // Trend insights
    if (trends.daily.length > 1) {
      const recentTrend = trends.daily.slice(-3);
      const avgRecent =
        recentTrend.reduce((sum, day) => sum + day.successRate, 0) /
        recentTrend.length;
      const avgOverall = metrics.successRate;

      if (avgRecent > avgOverall + 10) {
        insights.push(
          "Recent performance shows significant improvement in success rates."
        );
      } else if (avgRecent < avgOverall - 10) {
        insights.push(
          "Recent performance shows declining success rates. Investigation recommended."
        );
      }
    }

    return insights;
  }

  /**
   * Generate recommendations based on analytics
   */
  static generateRecommendations(
    metrics: CallMetrics,
    insights: string[]
  ): string[] {
    const recommendations: string[] = [];

    // Success rate recommendations
    if (metrics.successRate < 50) {
      recommendations.push(
        "Implement better phone number validation before dialing."
      );
      recommendations.push(
        "Review and update your contact list to remove invalid numbers."
      );
      recommendations.push(
        "Consider calling during different time periods to improve answer rates."
      );
    }

    // Duration recommendations
    if (metrics.averageDuration < 30) {
      recommendations.push(
        "Improve call screening to avoid invalid or unreachable numbers."
      );
      recommendations.push(
        "Train staff on better conversation starters to extend call duration."
      );
    }

    // Cost recommendations
    if (metrics.averageCost > 0.05) {
      recommendations.push(
        "Review international calling patterns and consider local numbers."
      );
      recommendations.push(
        "Implement call scheduling to optimize for lower-cost time periods."
      );
    }

    // General recommendations
    recommendations.push(
      "Monitor call analytics regularly to identify trends and patterns."
    );
    recommendations.push(
      "Use call history to identify and prioritize high-value contacts."
    );

    return recommendations;
  }

  /**
   * Generate comprehensive call report
   */
  static generateReport(
    calls: any[],
    period: "day" | "week" | "month" | "year",
    startDate: Date,
    endDate: Date
  ): CallReport {
    const filteredCalls = calls.filter((call) => {
      const callDate = new Date(call.timestamp);
      return callDate >= startDate && callDate <= endDate;
    });

    const metrics = this.calculateMetrics(filteredCalls);
    const trends = this.generateTrends(filteredCalls, "daily");
    const insights = this.generateInsights(metrics, trends);
    const recommendations = this.generateRecommendations(metrics, insights);

    return {
      period,
      startDate,
      endDate,
      metrics,
      trends,
      insights,
      recommendations,
    };
  }

  /**
   * Export call data to CSV format
   */
  static exportToCSV(calls: any[]): string {
    if (!calls || calls.length === 0) return "";

    const headers = [
      "Date",
      "Phone Number",
      "Status",
      "Duration (seconds)",
      "Cost (USD)",
      "Country",
      "User ID",
    ];

    const csvRows = [headers.join(",")];

    calls.forEach((call) => {
      const row = [
        new Date(call.timestamp).toISOString(),
        call.phone_number,
        call.status,
        call.duration || 0,
        call.total_cost || 0,
        call.destination_country || "Unknown",
        call.user_id,
      ]
        .map((field) => `"${field}"`)
        .join(",");

      csvRows.push(row);
    });

    return csvRows.join("\n");
  }

  /**
   * Calculate call efficiency metrics
   */
  static calculateEfficiencyMetrics(calls: any[]): {
    callsPerHour: number;
    averageTimeBetweenCalls: number;
    peakCallingHours: string[];
    mostProductiveDays: string[];
  } {
    if (!calls || calls.length === 0) {
      return {
        callsPerHour: 0,
        averageTimeBetweenCalls: 0,
        peakCallingHours: [],
        mostProductiveDays: [],
      };
    }

    // Sort calls by timestamp
    const sortedCalls = [...calls].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate calls per hour
    const totalHours =
      calls.length > 1
        ? (new Date(sortedCalls[sortedCalls.length - 1].timestamp).getTime() -
            new Date(sortedCalls[0].timestamp).getTime()) /
          (1000 * 60 * 60)
        : 1;

    const callsPerHour = totalHours > 0 ? calls.length / totalHours : 0;

    // Calculate average time between calls
    let totalTimeBetween = 0;
    let timeBetweenCount = 0;

    for (let i = 1; i < sortedCalls.length; i++) {
      const timeDiff =
        new Date(sortedCalls[i].timestamp).getTime() -
        new Date(sortedCalls[i - 1].timestamp).getTime();
      totalTimeBetween += timeDiff;
      timeBetweenCount++;
    }

    const averageTimeBetweenCalls =
      timeBetweenCount > 0 ? totalTimeBetween / timeBetweenCount : 0;

    // Analyze peak calling hours
    const hourCounts = new Array(24).fill(0);
    calls.forEach((call) => {
      const hour = new Date(call.timestamp).getHours();
      hourCounts[hour]++;
    });

    const maxHourCount = Math.max(...hourCounts);
    const peakCallingHours = hourCounts
      .map((count, hour) => ({ count, hour }))
      .filter(({ count }) => count === maxHourCount)
      .map(({ hour }) => `${hour}:00`);

    // Analyze most productive days
    const dayCounts = new Array(7).fill(0);
    calls.forEach((call) => {
      const day = new Date(call.timestamp).getDay();
      dayCounts[day]++;
    });

    const maxDayCount = Math.max(...dayCounts);
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const mostProductiveDays = dayCounts
      .map((count, day) => ({ count, day }))
      .filter(({ count }) => count === maxDayCount)
      .map(({ day }) => dayNames[day]);

    return {
      callsPerHour,
      averageTimeBetweenCalls,
      peakCallingHours,
      mostProductiveDays,
    };
  }
}
