import { supabase } from "./supabase";
import { TelnyxCostCalculator } from "./costCalculator";

export interface CallRecord {
  id?: string;
  user_id: string;
  phone_number: string;
  status: "completed" | "failed" | "missed" | "incoming";
  timestamp: Date;
  duration?: number;
  call_control_id?: string;
  voice_cost?: number;
  sip_trunking_cost?: number;
  total_cost?: number;
  currency?: string;
  destination_country?: string;
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
  total_voice_cost?: number;
  total_sip_trunking_cost?: number;
  total_cost?: number;
}

export class DatabaseService {
  // Create or update user record
  static async createOrUpdateUser(userData: {
    id: string;
    email: string;
    full_name?: string | null;
  }): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Try to insert new user, if conflict then update
      const { error } = await supabase.from("users").upsert(
        {
          id: userData.id,
          email: userData.email,
          full_name: userData.full_name,
          total_calls: 0,
          successful_calls: 0,
          failed_calls: 0,
          last_active: now,
          created_at: now,
          role: userData.email?.includes("admin") ? "admin" : "user",
          updated_at: now,
        },
        {
          onConflict: "id",
        }
      );

      if (error) throw error;
    } catch (error) {
      console.error("Error creating/updating user:", error);
      throw error;
    }
  }

  // Set user as admin
  static async setUserAsAdmin(userId: string): Promise<void> {
    try {
      // Note: This requires the service_role key in production
      // For now, we'll use a different approach by updating the users table
      const { error } = await supabase
        .from("users")
        .update({
          role: "admin",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;
    } catch (error) {
      console.error("Error setting user as admin:", error);
      throw error;
    }
  }

  // Check if user is admin
  static async isUserAdmin(userId: string): Promise<boolean> {
    // Clean up old cache entries periodically
    this.cleanupCache();

    // Add rate limiting to prevent repeated failed queries
    const cacheKey = `admin_check_${userId}`;
    const now = Date.now();
    const lastCheck = this.adminCheckCache.get(cacheKey);

    // If we checked recently and it failed, don't retry immediately
    if (lastCheck && now - lastCheck.timestamp < 30000) {
      // 30 second cooldown
      if (lastCheck.failed) {
        console.log(
          "Admin check failed recently, using cached result to prevent repeated queries"
        );
        return lastCheck.result;
      }
    }

    try {
      // Check our users table first for role
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (!userError && userData?.role === "admin") {
        // Cache successful result
        this.adminCheckCache.set(cacheKey, {
          result: true,
          timestamp: now,
          failed: false,
        });
        return true;
      }

      // If role check failed or user doesn't have admin role, check email as fallback
      if (userError) {
        console.warn(
          "Role check failed, trying email fallback:",
          userError.message
        );
      }

      // Fallback: check if email contains 'admin'
      const { data: user, error } = await supabase
        .from("users")
        .select("email")
        .eq("id", userId)
        .single();

      if (error) {
        console.warn(
          "Database query failed, falling back to email check:",
          error
        );
        // Cache failed result to prevent repeated queries
        this.adminCheckCache.set(cacheKey, {
          result: false,
          timestamp: now,
          failed: true,
        });
        // If database is unavailable, fall back to email-based admin check
        return false;
      }

      const result = user?.email?.includes("admin") || false;
      // Cache successful result
      this.adminCheckCache.set(cacheKey, {
        result,
        timestamp: now,
        failed: false,
      });
      return result;
    } catch (error) {
      console.error("Error checking admin status:", error);
      // Cache failed result to prevent repeated queries
      this.adminCheckCache.set(cacheKey, {
        result: false,
        timestamp: now,
        failed: true,
      });
      // Return false on any error to prevent admin access issues
      return false;
    }
  }

  // Track a new call
  static async trackCall(
    callData: Omit<CallRecord, "id" | "timestamp">
  ): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Validate required fields
        if (!callData.user_id || !callData.phone_number) {
          console.error("Missing required fields for call tracking:", callData);
          return;
        }

        // Calculate call costs based on status and duration
        let voiceCost = 0;
        let sipTrunkingCost = 0;
        let totalCost = 0;
        let destinationCountry = callData.destination_country;

        // If destination country not provided, try to extract from phone number
        if (!destinationCountry) {
          destinationCountry = TelnyxCostCalculator.getCountryFromPhoneNumber(
            callData.phone_number
          );
        }

        if (callData.status === "completed" && callData.duration) {
          // Calculate cost for completed calls
          const costBreakdown = TelnyxCostCalculator.calculateCompletedCallCost(
            callData.duration,
            destinationCountry
          );
          voiceCost = costBreakdown.voiceCost;
          sipTrunkingCost = costBreakdown.sipTrunkingCost;
          totalCost = costBreakdown.totalCost;
        } else if (
          callData.status === "failed" ||
          callData.status === "missed"
        ) {
          // Calculate minimal cost for failed/missed calls
          const costBreakdown =
            TelnyxCostCalculator.calculateFailedCallCost(destinationCountry);
          voiceCost = costBreakdown.voiceCost;
          sipTrunkingCost = costBreakdown.sipTrunkingCost;
          totalCost = costBreakdown.totalCost;
        }
        // For "incoming" status, costs are 0 until call completes

        const { error } = await supabase.from("calls").insert({
          user_id: callData.user_id,
          phone_number: callData.phone_number,
          status: callData.status,
          timestamp: new Date().toISOString(),
          duration: callData.duration,
          call_control_id: callData.call_control_id,
          voice_cost: voiceCost,
          sip_trunking_cost: sipTrunkingCost,
          total_cost: totalCost,
          currency: "USD",
          destination_country: destinationCountry,
        });

        if (error) throw error;

        // Update user statistics
        await this.updateUserStats(callData.user_id, callData.status);

        console.log("Call tracked successfully:", {
          user_id: callData.user_id,
          phone_number: callData.phone_number,
          status: callData.status,
          duration: callData.duration,
        });

        return; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        console.error(`Call tracking attempt ${retryCount} failed:`, error);

        if (retryCount >= maxRetries) {
          console.error("Max retries reached for call tracking, giving up");
          // Don't throw - we don't want call tracking to break the main functionality
          return;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Update call costs when call completes
  static async updateCallCosts(
    callControlId: string,
    duration: number,
    phoneNumber: string
  ): Promise<void> {
    try {
      // Get destination country from phone number
      const destinationCountry =
        TelnyxCostCalculator.getCountryFromPhoneNumber(phoneNumber);

      // Calculate costs for completed call
      const costBreakdown = TelnyxCostCalculator.calculateCompletedCallCost(
        duration,
        destinationCountry
      );

      // Update the call record with costs
      const { error } = await supabase
        .from("calls")
        .update({
          voice_cost: costBreakdown.voiceCost,
          sip_trunking_cost: costBreakdown.sipTrunkingCost,
          total_cost: costBreakdown.totalCost,
          currency: costBreakdown.currency,
          destination_country: destinationCountry,
          status: "completed", // Update status to completed
        })
        .eq("call_control_id", callControlId);

      if (error) throw error;

      // Also update user stats to include the new costs
      await this.updateUserStatsWithCosts(callControlId, costBreakdown);
    } catch (error) {
      console.error("Error updating call costs:", error);
      // Don't throw - we don't want cost updates to break the main functionality
    }
  }

  // Update user stats with cost information
  private static async updateUserStatsWithCosts(
    callControlId: string,
    costBreakdown: any
  ): Promise<void> {
    try {
      // First get the user_id from the call
      const { data: callData, error: callError } = await supabase
        .from("calls")
        .select("user_id")
        .eq("call_control_id", callControlId)
        .single();

      if (callError) throw callError;

      // Get current user stats to add to them
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("total_voice_cost, total_sip_trunking_cost, total_cost")
        .eq("id", callData.user_id)
        .single();

      if (userError) throw userError;

      // Calculate new totals by adding current costs
      const newTotalVoiceCost =
        (userData?.total_voice_cost || 0) + costBreakdown.voiceCost;
      const newTotalSipTrunkingCost =
        (userData?.total_sip_trunking_cost || 0) +
        costBreakdown.sipTrunkingCost;
      const newTotalCost =
        (userData?.total_cost || 0) + costBreakdown.totalCost;

      // Update user stats with accumulated cost information
      const { error: updateError } = await supabase
        .from("users")
        .update({
          total_voice_cost: newTotalVoiceCost,
          total_sip_trunking_cost: newTotalSipTrunkingCost,
          total_cost: newTotalCost,
          last_active: new Date().toISOString(),
        })
        .eq("id", callData.user_id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error("Error updating user stats with costs:", error);
      // Don't throw - we don't want cost updates to break the main functionality
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
        const updates: any = {
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

  // Static cache for admin checks to prevent repeated queries
  private static adminCheckCache = new Map<
    string,
    { result: boolean; timestamp: number; failed: boolean }
  >();

  // Clean up old cache entries periodically
  private static cleanupCache(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour old

    // Use Array.from to convert iterator to array for compatibility
    const entries = Array.from(this.adminCheckCache.entries());
    for (const [key, value] of entries) {
      if (now - value.timestamp > maxAge) {
        this.adminCheckCache.delete(key);
      }
    }

    // If cache is still too large, clear it completely
    if (this.adminCheckCache.size > 100) {
      console.log("Admin check cache too large, clearing completely");
      this.adminCheckCache.clear();
    }
  }
}
