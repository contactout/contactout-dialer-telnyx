import { supabase } from "./supabase";

export interface CallRecord {
  id?: string;
  user_id: string;
  phone_number: string;
  status: "completed" | "failed" | "missed" | "incoming";
  timestamp: Date;
  duration?: number;
  call_control_id?: string;
}

export interface UserStats {
  id: string;
  email: string;
  full_name?: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  last_active: Date;
  created_at: Date;
}

export class DatabaseService {
  // Track a new call
  static async trackCall(
    callData: Omit<CallRecord, "id" | "timestamp">
  ): Promise<void> {
    try {
      const { error } = await supabase.from("calls").insert({
        user_id: callData.user_id,
        phone_number: callData.phone_number,
        status: callData.status,
        timestamp: new Date().toISOString(),
        duration: callData.duration,
        call_control_id: callData.call_control_id,
      });

      if (error) throw error;

      // Update user statistics
      await this.updateUserStats(callData.user_id, callData.status);
    } catch (error) {
      console.error("Error tracking call:", error);
      // Don't throw - we don't want call tracking to break the main functionality
    }
  }

  // Update user statistics when a call is made
  static async updateUserStats(
    userId: string,
    callStatus: CallRecord["status"]
  ): Promise<void> {
    try {
      // First, try to get existing user stats
      const { data: existingStats, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = no rows returned
        throw fetchError;
      }

      const now = new Date().toISOString();

      if (existingStats) {
        // Update existing stats
        const updates = {
          total_calls: existingStats.total_calls + 1,
          last_active: now,
        };

        if (callStatus === "completed") {
          updates.successful_calls = existingStats.successful_calls + 1;
        } else if (callStatus === "failed") {
          updates.failed_calls = existingStats.failed_calls + 1;
        }

        const { error: updateError } = await supabase
          .from("users")
          .update(updates)
          .eq("id", userId);

        if (updateError) throw updateError;
      } else {
        // Create new user stats
        const newStats = {
          id: userId,
          total_calls: 1,
          successful_calls: callStatus === "completed" ? 1 : 0,
          failed_calls: callStatus === "failed" ? 1 : 0,
          last_active: now,
          created_at: now,
        };

        const { error: insertError } = await supabase
          .from("users")
          .insert(newStats);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error("Error updating user stats:", error);
      // Don't throw - we don't want stats updates to break the main functionality
    }
  }

  // Get user statistics
  static async getUserStats(): Promise<UserStats[]> {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("total_calls", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching user stats:", error);
      return [];
    }
  }

  // Get call statistics
  static async getCallStats(): Promise<{
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    total_users: number;
    active_users_today: number;
  }> {
    try {
      // Get total calls
      const { data: calls, error: callsError } = await supabase
        .from("calls")
        .select("*");

      if (callsError) throw callsError;

      // Get user stats
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("*");

      if (usersError) throw usersError;

      const totalCalls = calls?.length || 0;
      const successfulCalls =
        calls?.filter((call) => call.status === "completed").length || 0;
      const failedCalls =
        calls?.filter((call) => call.status === "failed").length || 0;

      // Calculate active users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeUsersToday =
        users?.filter((user) => {
          const lastActive = new Date(user.last_active);
          return lastActive >= today;
        }).length || 0;

      return {
        total_calls: totalCalls,
        successful_calls: successfulCalls,
        failed_calls: failedCalls,
        total_users: users?.length || 0,
        active_users_today: activeUsersToday,
      };
    } catch (error) {
      console.error("Error fetching call stats:", error);
      return {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        total_users: 0,
        active_users_today: 0,
      };
    }
  }

  // Initialize database tables (run this once to set up the schema)
  static async initializeTables(): Promise<void> {
    try {
      // Note: In a real application, you would use Supabase migrations
      // This is a simplified approach for demonstration
      console.log("Database tables should be created via Supabase migrations");
      console.log("Required tables: users, calls");
    } catch (error) {
      console.error("Error initializing tables:", error);
    }
  }
}
