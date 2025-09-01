"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DatabaseService, UserStats } from "@/lib/database";
import { TelnyxCostCalculator } from "@/lib/costCalculator";
import { supabase } from "@/lib/supabase";

interface CallStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_users: number;
  active_users_today: number;
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [callStats, setCallStats] = useState<CallStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [adminStatus, setAdminStatus] = useState<string>("Checking...");
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(null);
  const [userCallHistory, setUserCallHistory] = useState<any[]>([]);
  const [isLoadingCallHistory, setIsLoadingCallHistory] = useState(false);
  const [showCostInfo, setShowCostInfo] = useState(false);
  const [telnyxApiStatus, setTelnyxApiStatus] = useState<any>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      console.log("Admin page useEffect triggered:", {
        loading,
        hasUser: !!user,
        userEmail: user?.email,
        isAdmin,
        currentUrl:
          typeof window !== "undefined" ? window.location.href : "unknown",
      });

      // Wait for authentication to complete
      if (loading) {
        console.log("Still loading, waiting...");
        return;
      }

      // Check if user exists
      if (!user) {
        console.log("No user found, redirecting to login");
        window.location.href = "/";
        return;
      }

      if (user && !isAdmin) {
        console.log("User is not admin, access denied");
        setAdminStatus("No");
        setError("Access denied. Admin privileges required.");
        return;
      }

      if (user && isAdmin) {
        console.log("Admin access granted, fetching data");
        setAdminStatus("Yes");
        fetchAdminData();
      }
    };

    checkAdminAndFetch();
  }, [user, loading, isAdmin]);

  const fetchAdminData = async () => {
    try {
      setIsLoading(true);

      // Fetch user statistics and call statistics using the database service
      const [users, callStats] = await Promise.all([
        DatabaseService.getUserStats(),
        DatabaseService.getCallStats(),
      ]);

      setCallStats(callStats);
      setUserStats(users);
    } catch (err: any) {
      console.error("Error fetching admin data:", err);
      setError(err.message || "Failed to fetch admin data");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = () => {
    fetchAdminData();
  };

  const testTelnyxApi = async () => {
    try {
      setIsTestingApi(true);
      setTelnyxApiStatus(null);

      const result = await TelnyxCostCalculator.testTelnyxApiConnection();
      setTelnyxApiStatus(result);

      if (result.isConnected) {
        // Also test getting available countries
        try {
          const countries = await TelnyxCostCalculator.getAvailableCountries();
          const cacheStats = TelnyxCostCalculator.getCacheStats();

          setTelnyxApiStatus({
            ...result,
            availableCountries: countries,
            cacheStats,
          });
        } catch (countryError) {
          console.warn("Failed to get available countries:", countryError);
        }
      }
    } catch (error) {
      setTelnyxApiStatus({
        isConnected: false,
        message: `API test failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        details: { error },
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  const fetchDebugInfo = async () => {
    if (user) {
      try {
        const debug = await DatabaseService.debugAdminStatus(user.id);
        setDebugInfo(debug);
        setAdminStatus(debug.isAdmin ? "Yes" : "No");
      } catch (error) {
        console.error("Error fetching debug info:", error);
        setAdminStatus("Error");
      }
    }
  };

  const openCallHistory = async (userStats: UserStats) => {
    setSelectedUser(userStats);
    setShowCallHistory(true);
    setIsLoadingCallHistory(true);

    try {
      // Fetch call history for the selected user
      const { data: calls, error } = await supabase
        .from("calls")
        .select("*")
        .eq("user_id", userStats.id)
        .order("timestamp", { ascending: false })
        .limit(100); // Limit to last 100 calls for performance

      if (error) throw error;
      setUserCallHistory(calls || []);
    } catch (error) {
      console.error("Error fetching call history:", error);
      setUserCallHistory([]);
    } finally {
      setIsLoadingCallHistory(false);
    }
  };

  const toggleDebug = () => {
    setShowDebug(!showDebug);
    if (!showDebug && !debugInfo) {
      fetchDebugInfo();
    }
  };

  // Only show loading if we're still checking authentication AND don't have a user
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show loading only for data fetching, not for auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading admin data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">⚠️ {error}</div>
          <button
            onClick={() => (window.location.href = "/")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 scroll-smooth">
      {/* Header - Sticky */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Admin Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Call Analytics & User Statistics
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => (window.location.href = "/")}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl flex items-center space-x-2 font-semibold text-lg"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span>Back to Dialer</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Telnyx API Test Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              Telnyx API Integration Test
            </h2>
            <button
              onClick={testTelnyxApi}
              disabled={isTestingApi}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isTestingApi ? "Testing..." : "Test API Connection"}
            </button>
          </div>

          {telnyxApiStatus && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg ${
                  telnyxApiStatus.isConnected
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      telnyxApiStatus.isConnected
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span
                    className={`font-medium ${
                      telnyxApiStatus.isConnected
                        ? "text-green-800"
                        : "text-red-800"
                    }`}
                  >
                    {telnyxApiStatus.message}
                  </span>
                </div>

                {telnyxApiStatus.details && (
                  <div className="mt-2 text-sm text-gray-600">
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(telnyxApiStatus.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {telnyxApiStatus.isConnected &&
                telnyxApiStatus.availableCountries && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-medium text-blue-800 mb-2">
                      Available Countries
                    </h3>
                    <div className="text-sm text-blue-700">
                      {telnyxApiStatus.availableCountries.length} countries
                      available for pricing
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {telnyxApiStatus.availableCountries
                        .slice(0, 20)
                        .map((country: string) => (
                          <span
                            key={country}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {country}
                          </span>
                        ))}
                      {telnyxApiStatus.availableCountries.length > 20 && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                          +{telnyxApiStatus.availableCountries.length - 20} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

              {telnyxApiStatus.isConnected && telnyxApiStatus.cacheStats && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-medium text-purple-800 mb-2">
                    Pricing Cache Statistics
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-purple-600">Total Entries:</span>
                      <div className="font-medium">
                        {telnyxApiStatus.cacheStats.totalEntries}
                      </div>
                    </div>
                    <div>
                      <span className="text-purple-600">Active Entries:</span>
                      <div className="font-medium">
                        {telnyxApiStatus.cacheStats.activeEntries}
                      </div>
                    </div>
                    <div>
                      <span className="text-purple-600">Expired Entries:</span>
                      <div className="font-medium">
                        {telnyxApiStatus.cacheStats.expiredEntries}
                      </div>
                    </div>
                    <div>
                      <span className="text-purple-600">Cache Hit Rate:</span>
                      <div className="font-medium">
                        {telnyxApiStatus.cacheStats.cacheHitRate}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-sm text-gray-600">
            <p>
              This section tests the Telnyx API integration for real-time
              pricing data.
            </p>
            <p>
              Make sure your{" "}
              <code className="bg-gray-100 px-1 rounded">
                NEXT_PUBLIC_TELNYX_API_KEY
              </code>{" "}
              is configured in your environment variables.
            </p>
          </div>
        </div>
      </div>

      {showDebug && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Debug Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Current User:
                </p>
                <p className="text-sm text-gray-900">
                  {user?.email || "Not logged in"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">User ID:</p>
                <p className="text-sm text-gray-900">{user?.id || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Authentication Status:
                </p>
                <p className="text-sm text-gray-900">
                  {loading
                    ? "Loading..."
                    : user
                    ? "Authenticated"
                    : "Not Authenticated"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Admin Privileges (DB Check):
                </p>
                <p className="text-sm text-gray-900">{adminStatus}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Is Admin (Cached):
                </p>
                <p className="text-sm text-gray-900">
                  {isAdmin ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Has Admin Email:
                </p>
                <p className="text-sm text-gray-900">
                  {user?.email?.toLowerCase().includes("admin") ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Current URL:
                </p>
                <p className="text-sm text-gray-900">
                  {typeof window !== "undefined" ? window.location.href : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Buttons */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={toggleDebug}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center space-x-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{showDebug ? "Hide Debug" : "Show Debug"}</span>
            </button>

            <button
              onClick={refreshData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 11-1.885-.666A5.002 5.002 0 005.999 9H3a1 1 0 010-2h5a1 1 0 011 1v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5a1 1 0 01.008-.943z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Refresh Data</span>
            </button>

            <button
              onClick={() => (window.location.href = "/admin/manage")}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
              <span>Manage Users</span>
            </button>

            <button
              onClick={() => {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                console.log("Environment variables:", {
                  supabaseUrl,
                  supabaseKey,
                });
                alert(
                  `Supabase URL: ${supabaseUrl}\nSupabase Key: ${
                    supabaseKey ? "SET" : "NOT SET"
                  }`
                );
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>Check Environment</span>
            </button>
          </div>
        </div>

        {/* Overview Statistics - Compressed Single Row */}
        {callStats && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">
                Overview Statistics
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-blue-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">
                      Total Calls
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {callStats.total_calls}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">
                      Successful
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {callStats.successful_calls}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-red-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">Failed</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {callStats.failed_calls}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-purple-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">
                      Total Users
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {callStats.total_users}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-yellow-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">
                      Active Today
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {callStats.active_users_today}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-xs font-medium text-gray-600">
                      Total Cost
                    </p>
                    <p className="text-lg font-semibold text-green-600">
                      {userStats
                        .reduce(
                          (total, user) => total + (user.total_cost || 0),
                          0
                        )
                        .toFixed(4)}
                    </p>
                    <p className="text-xs text-gray-500">USD</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cost Information Section */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">
                  Cost Calculation Information
                </h2>
                <p className="text-sm text-gray-600">
                  How call costs are calculated and pricing details
                </p>
              </div>
              <button
                onClick={() => setShowCostInfo(!showCostInfo)}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${
                    showCostInfo ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                <span>{showCostInfo ? "Hide Details" : "Show Details"}</span>
              </button>
            </div>
          </div>

          {showCostInfo && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Cost Breakdown */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Cost Components
                  </h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>Voice Cost:</span>
                      <span className="font-medium">$0.002 per minute</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SIP Trunking:</span>
                      <span className="font-medium">Regional rates vary</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Cost:</span>
                      <span className="font-medium">Voice + SIP Trunking</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed Calls:</span>
                      <span className="font-medium">10% of 1-min SIP cost</span>
                    </div>
                  </div>
                </div>

                {/* Regional Pricing Examples */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Regional SIP Rates (per minute)
                  </h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>US/Canada:</span>
                      <span className="font-medium">$0.0005 - $0.0008</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Europe:</span>
                      <span className="font-medium">$0.0012 - $0.0015</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Asia Pacific:</span>
                      <span className="font-medium">$0.0018 - $0.0025</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Other Regions:</span>
                      <span className="font-medium">$0.0010 (default)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing Source Information */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  Pricing Source
                </h3>
                <div className="flex items-center space-x-4 text-sm text-gray-700">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Live API: Real-time Telnyx rates</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span>Fallback: Quarterly-updated rates</span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  The system automatically uses the most accurate pricing
                  available, falling back to cached rates when needed.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* User Statistics Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              User Call Statistics
            </h2>
            <p className="text-sm text-gray-600">
              Detailed breakdown of calls per user
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Calls
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Successful
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Failed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userStats.map((user) => {
                  const successRate =
                    user.total_calls > 0
                      ? Math.round(
                          (user.successful_calls / user.total_calls) * 100
                        )
                      : 0;

                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.full_name || "Unknown"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.total_calls}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                        {user.successful_calls}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                        {user.failed_calls}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: `${successRate}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-900">
                            {successRate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-medium text-green-600">
                          {TelnyxCostCalculator.formatCost(
                            user.total_cost || 0
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.last_active).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => openCallHistory(user)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-xs font-medium flex items-center space-x-1"
                          title="View detailed call history for this user"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          <span>View History</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {userStats.length === 0 && (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No data available
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Start making calls to see statistics here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Call History Modal */}
      {showCallHistory && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Call History for{" "}
                  {selectedUser.full_name || selectedUser.email}
                </h3>
                <p className="text-sm text-gray-600">
                  Detailed call log for this user
                </p>
              </div>
              <button
                onClick={() => setShowCallHistory(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden">
              {isLoadingCallHistory ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">
                    Loading call history...
                  </span>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
                  {userCallHistory.length === 0 ? (
                    <div className="text-center py-12">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"
                        />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        No calls found
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        This user hasn&apos;t made any calls yet.
                      </p>
                    </div>
                  ) : (
                    <div className="px-6 py-4">
                      <div className="space-y-3">
                        {userCallHistory.map((call, index) => (
                          <div
                            key={call.id || index}
                            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <span
                                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                      call.status === "completed"
                                        ? "bg-green-100 text-green-800"
                                        : call.status === "failed"
                                        ? "bg-red-100 text-red-800"
                                        : call.status === "missed"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {call.status?.charAt(0).toUpperCase() +
                                      call.status?.slice(1) || "Unknown"}
                                  </span>
                                  <span className="text-sm text-gray-600">
                                    {call.phone_number}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500">Date:</span>
                                    <span className="ml-2 text-gray-900">
                                      {new Date(
                                        call.timestamp
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                  {call.duration && (
                                    <div>
                                      <span className="text-gray-500">
                                        Duration:
                                      </span>
                                      <span className="ml-2 text-gray-900">
                                        {Math.floor(call.duration / 60)}:
                                        {(call.duration % 60)
                                          .toString()
                                          .padStart(2, "0")}
                                      </span>
                                    </div>
                                  )}
                                  {call.total_cost && (
                                    <div>
                                      <span className="text-gray-500">
                                        Cost:
                                      </span>
                                      <span className="ml-2 text-gray-900 font-medium text-green-600">
                                        {TelnyxCostCalculator.formatCost(
                                          call.total_cost
                                        )}
                                      </span>
                                      {call.pricing_source && (
                                        <span
                                          className={`ml-2 text-xs px-2 py-1 rounded-full ${
                                            call.pricing_source === "api"
                                              ? "bg-green-100 text-green-700"
                                              : call.pricing_source ===
                                                "fallback"
                                              ? "bg-yellow-100 text-yellow-700"
                                              : "bg-gray-100 text-gray-700"
                                          }`}
                                        >
                                          {call.pricing_source === "api"
                                            ? "Live"
                                            : "Fallback"}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {call.destination_country && (
                                    <div>
                                      <span className="text-gray-500">
                                        Country:
                                      </span>
                                      <span className="ml-2 text-gray-900">
                                        {call.destination_country}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Showing {userCallHistory.length} calls
                  {userCallHistory.length === 100 &&
                    " (limited to last 100 calls)"}
                </div>
                <button
                  onClick={() => setShowCallHistory(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
