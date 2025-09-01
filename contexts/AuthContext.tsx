"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DatabaseService } from "@/lib/database";
import SessionTimeoutWarning from "@/components/SessionTimeoutWarning";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionTimeout, setSessionTimeout] = useState<NodeJS.Timeout | null>(
    null
  );
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const signOutRef = useRef<(() => Promise<void>) | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Debug logging for admin status changes
  useEffect(() => {
    console.log("AuthContext - isAdmin state changed to:", isAdmin);
  }, [isAdmin]);

  const lastProcessedEventRef = useRef<string | null>(null);
  const subscriptionRef = useRef<any>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionCreatedRef = useRef<boolean>(false);

  // Session timeout duration (4 hours in milliseconds)
  const SESSION_TIMEOUT_DURATION = 4 * 60 * 60 * 1000; // 4 hours

  // Domain validation function
  const isContactOutDomain = (email: string): boolean => {
    return (
      email.endsWith("@contactout.com") || email.endsWith("@contactout.io")
    );
  };

  // Check if user should be allowed access (admin users bypass domain restrictions)
  const shouldAllowAccess = async (
    email: string,
    userId: string
  ): Promise<boolean> => {
    try {
      console.log(`Checking access for user: ${email} (${userId})`);

      // Check if user is already an admin in our database
      try {
        const isAdmin = await DatabaseService.isUserAdmin(userId);
        console.log(`Admin check result for ${userId}: ${isAdmin}`);

        if (isAdmin) {
          console.log(`User ${userId} is admin, allowing access`);
          return true; // Admin users can always access
        }
      } catch (adminCheckError) {
        console.warn(
          "Admin check failed, falling back to domain check:",
          adminCheckError
        );
      }

      // For non-admin users, check domain restriction
      const domainAllowed = isContactOutDomain(email);
      console.log(`Domain check for ${email}: ${domainAllowed}`);

      return domainAllowed;
    } catch (error) {
      console.error("Error in shouldAllowAccess:", error);
      // Fall back to domain check if admin check fails
      return isContactOutDomain(email);
    }
  };

  // Check and cache admin status once during authentication
  const checkAndCacheAdminStatus = useCallback(async (userId: string) => {
    try {
      const adminStatus = await DatabaseService.isUserAdmin(userId);
      console.log(`Setting admin status to: ${adminStatus} for user ${userId}`);
      setIsAdmin(adminStatus);
      console.log(`Admin status cached for user ${userId}: ${adminStatus}`);
      return adminStatus;
    } catch (error) {
      console.warn("Admin check failed:", error);
      setIsAdmin(false);
      return false;
    }
  }, []);

  // Reset session timeout
  const resetSessionTimeout = useCallback(() => {
    // Clear existing timeout
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
    }

    // Set session start time
    setSessionStartTime(Date.now());

    // Set new timeout
    const timeout = setTimeout(() => {
      console.log("Session expired due to inactivity");
      if (signOutRef.current) {
        signOutRef.current();
      }
      setAuthError("Session expired due to inactivity. Please log in again.");
    }, SESSION_TIMEOUT_DURATION);

    setSessionTimeout(timeout);
  }, [sessionTimeout]);

  // Activity tracking
  const trackUserActivity = useCallback(() => {
    if (user) {
      resetSessionTimeout();
    }
  }, [user, resetSessionTimeout]);

  useEffect(() => {
    // Set up loading timeout to prevent stuck loading screens
    // Only start the timeout if we don't have a session yet
    if (!session && !user) {
      loadingTimeoutRef.current = setTimeout(() => {
        if (loading) {
          console.warn(
            "Loading timeout reached, forcing loading state to false"
          );
          setLoading(false);
          setAuthError(
            "Loading timeout. Please refresh the page or try again."
          );
        }
      }, 10000); // Increased to 10 seconds for authentication flow
    }

    // Set up activity tracking event listeners
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    const handleActivity = () => {
      trackUserActivity();
    };

    // Add event listeners for user activity
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Check if Supabase credentials are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !supabaseUrl ||
      !supabaseKey ||
      supabaseUrl.includes("your_") ||
      supabaseKey.includes("your_")
    ) {
      // Show clear error message when credentials are missing
      console.error(
        "Supabase credentials not configured. Authentication will not work."
      );
      setAuthError(
        "Authentication is not configured. Please check your environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)."
      );
      setLoading(false);
      return;
    }

    // Get initial session (only once)
    if (!hasInitialized) {
      setHasInitialized(true);
      supabase.auth
        .getSession()
        .then(async ({ data: { session } }) => {
          console.log(
            "Initial session check result:",
            session ? "Session found" : "No session"
          );
          if (session?.user?.email) {
            console.log("Initial session user:", session.user.email);

            // Check admin status for initial session
            if (session.user.id) {
              console.log(
                "Checking admin status for initial session user:",
                session.user.id
              );
              const adminStatus = await checkAndCacheAdminStatus(
                session.user.id
              );
              console.log("Initial session admin status:", adminStatus);
              setIsAdmin(adminStatus);
            }
          }
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);

          // Clear loading timeout if we got a session
          if (session && loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }
        })
        .catch((error) => {
          console.error("Supabase auth error:", error);
          setAuthError(`Authentication error: ${error.message}`);
          setLoading(false);
        });
    }

    // Listen for auth changes - only create subscription once
    if (!subscriptionCreatedRef.current) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(
          `=== AUTH STATE CHANGE: ${event} ===`,
          session ? `for user ${session.user.email}` : "no session"
        );

        // Skip if this is not a real auth change (avoid duplicate processing)
        const eventKey = `${event}-${session?.user?.id || "no-user"}`;
        if (lastProcessedEventRef.current === eventKey) {
          console.log(`Skipping duplicate event: ${eventKey}`);
          return;
        }
        lastProcessedEventRef.current = eventKey;

        if (session?.user?.email) {
          console.log(
            `Auth state change: ${event} for user ${session.user.email}`
          );

          // Clear loading timeout since we have a user
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
          }

          // Create or update user record in our users table FIRST
          try {
            await DatabaseService.createOrUpdateUser({
              id: session.user.id,
              email: session.user.email,
              full_name: session.user.user_metadata?.full_name || null,
            });
            console.log(
              `User record created/updated for ${session.user.email}`
            );
          } catch (error) {
            console.error("Failed to create/update user record:", error);
            // Don't block login if user creation fails, but log the issue
            // This could indicate a database trigger failure or RLS policy issue
            console.warn(
              "User creation failed - this may indicate a database configuration issue"
            );

            // Try to get user details to see if they exist
            try {
              const userDetails = await DatabaseService.getUserDetails(
                session.user.id
              );
              if (!userDetails) {
                console.error(
                  "User does not exist in database - database trigger may have failed"
                );
                // You might want to show a warning to the user here
              }
            } catch (detailError) {
              console.error("Could not verify user existence:", detailError);
            }
          }

          // Check and cache admin status once
          console.log("About to check admin status for user:", session.user.id);
          const adminStatus = await checkAndCacheAdminStatus(session.user.id);
          console.log("Admin status check result:", adminStatus);

          // Set the admin status in state
          setIsAdmin(adminStatus);
          console.log("Setting isAdmin state to:", adminStatus);

          // Grant access based on admin status or ContactOut domain
          console.log(
            "Checking access - adminStatus:",
            adminStatus,
            "isContactOut:",
            isContactOutDomain(session.user.email)
          );
          if (adminStatus || isContactOutDomain(session.user.email)) {
            console.log(
              `Access granted for ${
                session.user.email
              } (Admin: ${adminStatus}, ContactOut: ${isContactOutDomain(
                session.user.email
              )})`
            );
            setAuthError(null);
            resetSessionTimeout();
            setSession(session);
            setUser(session.user);
            setLoading(false);
            return;
          }

          // Final fallback - deny access
          console.log(`Access denied for ${session.user.email}, signing out`);
          setAuthError("Access restricted to ContactOut domain emails only.");
          // Sign out the user immediately
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // No session - clear loading state
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      // Store the subscription for cleanup
      subscriptionRef.current = subscription;
      subscriptionCreatedRef.current = true;
    }

    // Safety mechanism: ensure loading state is cleared after a reasonable time
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn("Safety timeout: forcing loading state to false");
        setLoading(false);
      }
    }, 15000); // 15 seconds safety timeout

    return () => {
      // Clean up safety timeout
      clearTimeout(safetyTimeout);

      // Clean up loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      // Clean up event listeners
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      // Clean up subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }

      // Clean up session timeout
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
    };
  }, [sessionTimeout, trackUserActivity, resetSessionTimeout, hasInitialized]);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
    if (error) {
      console.error("Error signing in with Google:", error.message);
    }
  };

  const signOut = async () => {
    console.log("Signing out user...");

    // Clear session timeout
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      setSessionTimeout(null);
    }

    // Clear all auth state
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setLoading(false);
    setAuthError(null);

    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
    } else {
      console.log("User signed out successfully");
    }
  };

  // Store signOut function in ref for use in timeouts
  useEffect(() => {
    signOutRef.current = signOut;
  }, []);

  const value = {
    user,
    session,
    loading,
    isAdmin,
    signInWithGoogle,
    signOut,
    authError,
  };

  // Calculate time remaining for session timeout warning
  const timeRemaining = sessionStartTime
    ? Math.max(0, SESSION_TIMEOUT_DURATION - (Date.now() - sessionStartTime))
    : SESSION_TIMEOUT_DURATION; // Don't show warning immediately after login

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionTimeoutWarning
        isVisible={!!user && !loading}
        timeRemaining={timeRemaining}
        onExtendSession={trackUserActivity}
        onLogout={signOut}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
