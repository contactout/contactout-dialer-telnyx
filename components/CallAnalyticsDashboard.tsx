import React, { useState, useEffect, useCallback } from "react";
import { CallAnalytics, CallMetrics, CallReport } from "@/lib/callAnalytics";
import { logError } from "@/lib/errorHandler";

interface CallAnalyticsDashboardProps {
  callHistory: any[];
  userId?: string;
  isVisible: boolean;
  onClose: () => void;
}

const CallAnalyticsDashboard: React.FC<CallAnalyticsDashboardProps> = ({
  callHistory,
  userId,
  isVisible,
  onClose,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<
    "day" | "week" | "month" | "year"
  >("week");
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [report, setReport] = useState<CallReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate metrics for the selected period
      const now = new Date();
      let startDate: Date;

      switch (selectedPeriod) {
        case "day":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );
          break;
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Filter calls for the selected period
      const periodCalls = callHistory.filter((call) => {
        const callDate = new Date(call.timestamp);
        return callDate >= startDate && callDate <= now;
      });

      // Generate metrics and report
      const periodMetrics = CallAnalytics.calculateMetrics(periodCalls);
      const periodReport = CallAnalytics.generateReport(
        periodCalls,
        selectedPeriod,
        startDate,
        now
      );

      setMetrics(periodMetrics);
      setReport(periodReport);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to generate analytics";
      setError(errorMessage);
      logError("Analytics generation failed", {
        level: "error",
        category: "system",
        details: { error: err, period: selectedPeriod },
      });
    } finally {
      setLoading(false);
    }
  }, [callHistory, selectedPeriod]);

  useEffect(() => {
    if (isVisible && callHistory.length > 0) {
      generateAnalytics();
    }
  }, [isVisible, callHistory, selectedPeriod, generateAnalytics]);

  const exportData = () => {
    try {
      const csvData = CallAnalytics.exportToCSV(callHistory);
      const blob = new Blob([csvData], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `call-analytics-${selectedPeriod}-${
        new Date().toISOString().split("T")[0]
      }.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      logError("Data export failed", {
        level: "error",
        category: "system",
        details: { error: err },
      });
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            Call Analytics Dashboard
          </h2>
          <div className="flex items-center space-x-4">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="day">Last 24 Hours</option>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="year">Last Year</option>
            </select>
            <button
              onClick={exportData}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Generating analytics...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && metrics && report && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-blue-50 rounded-lg p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-8 w-8 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-blue-600">
                        Total Calls
                      </p>
                      <p className="text-2xl font-bold text-blue-900">
                        {metrics.totalCalls}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-8 w-8 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-green-600">
                        Success Rate
                      </p>
                      <p className="text-2xl font-bold text-green-900">
                        {metrics.successRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-8 w-8 text-purple-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-purple-600">
                        Avg Duration
                      </p>
                      <p className="text-2xl font-bold text-purple-900">
                        {Math.round(metrics.averageDuration / 60)}m{" "}
                        {Math.round(metrics.averageDuration % 60)}s
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-8 w-8 text-orange-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                        />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-orange-600">
                        Total Cost
                      </p>
                      <p className="text-2xl font-bold text-orange-900">
                        ${metrics.totalCost.toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Call Status Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Call Status Breakdown
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Successful Calls
                      </span>
                      <span className="text-sm font-medium text-green-600">
                        {metrics.successfulCalls}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Failed Calls
                      </span>
                      <span className="text-sm font-medium text-red-600">
                        {metrics.failedCalls}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Missed Calls
                      </span>
                      <span className="text-sm font-medium text-yellow-600">
                        {metrics.missedCalls}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Incoming Calls
                      </span>
                      <span className="text-sm font-medium text-blue-600">
                        {metrics.incomingCalls}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Call Quality Metrics
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Total Duration
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {Math.round(metrics.totalDuration / 3600)}h{" "}
                        {Math.round((metrics.totalDuration % 3600) / 60)}m
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Average Cost per Call
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        ${metrics.averageCost.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        Calls per Hour
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {metrics.totalCalls > 0
                          ? (metrics.totalCalls / 24).toFixed(1)
                          : "0"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insights and Recommendations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Key Insights
                  </h3>
                  <div className="space-y-3">
                    {report.insights.length > 0 ? (
                      report.insights.map((insight, index) => (
                        <div key={index} className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            <svg
                              className="h-4 w-4 text-blue-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <p className="ml-3 text-sm text-gray-700">
                            {insight}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">
                        No specific insights for this period.
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Recommendations
                  </h3>
                  <div className="space-y-3">
                    {report.recommendations.length > 0 ? (
                      report.recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start">
                          <div className="flex-shrink-0 mt-1">
                            <svg
                              className="h-4 w-4 text-green-600"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <p className="ml-3 text-sm text-gray-700">
                            {recommendation}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">
                        No specific recommendations for this period.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Performance Trends */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Performance Trends
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">
                      Daily Success Rate
                    </h4>
                    <div className="space-y-2">
                      {report.trends.daily.slice(-7).map((day, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center"
                        >
                          <span className="text-xs text-gray-500">
                            {day.date
                              ? new Date(day.date).toLocaleDateString()
                              : "Unknown Date"}
                          </span>
                          <span
                            className={`text-sm font-medium ${
                              day.successRate > 80
                                ? "text-green-600"
                                : day.successRate > 60
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {day.successRate.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">
                      Call Volume
                    </h4>
                    <div className="space-y-2">
                      {report.trends.daily.slice(-7).map((day, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center"
                        >
                          <span className="text-xs text-gray-500">
                            {day.date
                              ? new Date(day.date).toLocaleDateString()
                              : "Unknown Date"}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {day.totalCalls}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-600 mb-2">
                      Average Duration
                    </h4>
                    <div className="space-y-2">
                      {report.trends.daily.slice(-7).map((day, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center"
                        >
                          <span className="text-xs text-gray-500">
                            {day.date
                              ? new Date(day.date).toLocaleDateString()
                              : "Unknown Date"}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {Math.round(day.averageDuration / 60)}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallAnalyticsDashboard;
