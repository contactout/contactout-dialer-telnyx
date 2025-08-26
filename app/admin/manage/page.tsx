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
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCallCostHistory, setShowCallCostHistory] = useState(false);

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      if (!loading && !user) {
        window.location.href = "/";
        return;
      }

      if (user) {
        // Check if user is admin using our database service
        try {
          const isAdmin = await DatabaseService.isUserAdmin(user.id);
          if (!isAdmin) {
            setError("Access denied. Admin privileges required.");
            return;
          }
          fetchUsers();
        } catch (error) {
          console.error("Error checking admin status:", error);
          setError("Failed to verify admin privileges");
        }
      }
    };

    checkAdminAndFetch();
  }, [user, loading]);

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
    try {
      setSuccessMessage(null);
      setError(null);

      await DatabaseService.setUserAsAdmin(userId);

      setSuccessMessage("User role updated successfully");
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.message || "Failed to update user role");
    }
  };

  const removeAdminRole = async (userId: string) => {
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

      setSuccessMessage("Admin role removed successfully");
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
                onClick={() => setShowCallCostHistory(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Call Cost History
              </button>
              <button
                onClick={fetchUsers}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={() => (window.location.href = "/admin")}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {user.full_name || "No name"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {user.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {user.role === "admin" ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="text-xs">
                        <div>Total: {user.total_calls}</div>
                        <div className="text-green-600">
                          ✓ {user.successful_calls}
                        </div>
                        <div className="text-red-600">
                          ✗ {user.failed_calls}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {user.role === "admin" ? (
                        <button
                          onClick={() => removeAdminRole(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Remove Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => setUserAsAdmin(user.id)}
                          className="text-blue-600 hover:text-blue-900"
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
