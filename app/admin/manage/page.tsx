"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DatabaseService } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import CallCostHistory from "@/components/CallCostHistory";

interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
  role: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  last_active: string;
}

export default function AdminManagePage() {
  const { user, loading, isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCallCostHistory, setShowCallCostHistory] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      if (!loading && !user) {
        window.location.href = "/";
        return;
      }

      if (user && !isAdmin) {
        setError("Access denied. Admin privileges required.");
        return;
      }

      if (user && isAdmin) {
        fetchUsers();
      }
    };

    checkAdminAndFetch();
  }, [user, loading, isAdmin]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);

      // Get all users from our users table
      const { data: users, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setUsers(users || []);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(err.message || "Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  const setUserAsAdmin = async (userId: string) => {
    // Get user details for confirmation
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const confirmed = window.confirm(
      `Are you sure you want to grant admin privileges to ${targetUser.email}?\n\nThis will allow them to access the admin dashboard and manage other users.`
    );

    if (!confirmed) return;

    try {
      setSuccessMessage(null);
      setError(null);

      await DatabaseService.setUserAsAdmin(userId);

      setSuccessMessage(
        `Admin privileges granted to ${targetUser.email} successfully`
      );
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.message || "Failed to update user role");
    }
  };

  const removeAdminRole = async (userId: string) => {
    // Get user details for confirmation
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const confirmed = window.confirm(
      `Are you sure you want to remove admin privileges from ${targetUser.email}?\n\nThis will restrict their access to the admin dashboard.`
    );

    if (!confirmed) return;

    try {
      setSuccessMessage(null);
      setError(null);

      // Remove admin role by setting it to 'user'
      const { error } = await supabase
        .from("users")
        .update({
          role: "user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      setSuccessMessage(
        `Admin privileges removed from ${targetUser.email} successfully`
      );
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.message || "Failed to remove admin role");
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
            onClick={() => (window.location.href = "/admin")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                User Management
              </h1>
              <p className="text-sm text-gray-600">
                Manage user roles and permissions
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => (window.location.href = "/admin")}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
              </button>
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

      {showDebug && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Debug Panel
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Current User ID:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {user?.id || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Current User Role:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {user?.role || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Is Loading:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {loading ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Is Admin:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {user?.role === "admin" ? "Yes" : "No"}
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
              onClick={() => setShowDebug(!showDebug)}
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
              onClick={() => setShowCallCostHistory(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
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
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                />
              </svg>
              <span>Call Cost History</span>
            </button>

            <button
              onClick={fetchUsers}
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
              <span>Refresh Users</span>
            </button>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6 p-4 bg-green-100 border border-green-300 rounded-lg text-green-700">
            {successMessage}
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">All Users</h2>
            <p className="text-sm text-gray-600">
              Manage user roles and permissions
            </p>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> You can toggle user roles between
                &quot;User&quot; and &quot;Admin&quot;. Admin users can access
                the admin dashboard and manage other users. User accounts cannot
                be deleted - only their roles can be modified.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Calls
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((tableUser) => (
                  <tr key={tableUser.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {tableUser.full_name || "No name"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {tableUser.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          tableUser.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {tableUser.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs">
                        <div>Total: {tableUser.total_calls}</div>
                        <div className="text-green-600">
                          ✓ {tableUser.successful_calls}
                        </div>
                        <div className="text-red-600">
                          ✗ {tableUser.failed_calls}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tableUser.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {tableUser.role === "admin" ? (
                        <button
                          onClick={() => removeAdminRole(tableUser.id)}
                          disabled={tableUser.id === (user?.id || "")}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            tableUser.id === (user?.id || "")
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                          title={
                            tableUser.id === (user?.id || "")
                              ? "Cannot remove your own admin privileges"
                              : "Click to remove admin privileges"
                          }
                        >
                          {tableUser.id === (user?.id || "")
                            ? "Current User"
                            : "Remove Admin"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setUserAsAdmin(tableUser.id)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-xs font-medium"
                          title="Click to grant admin privileges"
                        >
                          Make Admin
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && (
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No users found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Users will appear here after they sign in.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Call Cost History Modal */}
      <CallCostHistory
        isVisible={showCallCostHistory}
        onClose={() => setShowCallCostHistory(false)}
      />
    </div>
  );
}
