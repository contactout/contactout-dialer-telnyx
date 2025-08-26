"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DatabaseService } from "@/lib/database";
import SessionTimeoutWarning from "@/components/SessionTimeoutWarning";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

  // Session timeout duration (4 hours in milliseconds)
  const SESSION_TIMEOUT_DURATION = 4 * 60 * 60 * 1000; // 4 hours

  // Domain validation function
  const isContactOutDomain = (email: string): boolean => {
    return (
      email.endsWith("@contactout.com") || email.endsWith("@contactout.io")
    );
  };

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
      signOut();
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
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.warn("Loading timeout reached, forcing loading state to false");
        setLoading(false);
        setAuthError("Loading timeout. Please refresh the page or try again.");
      }
    }, 10000); // 10 second timeout

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
      // Skip auth if credentials are not configured
      console.warn(
        "Supabase credentials not configured. Skipping authentication."
      );
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Supabase auth error:", error);
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user?.email) {
        // Check if the user's email domain is allowed
        if (!isContactOutDomain(session.user.email)) {
          setAuthError("Access restricted to ContactOut domain emails only.");
          // Sign out the user immediately
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // Create or update user record in our users table
        try {
          await DatabaseService.createOrUpdateUser({
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || null,
          });
        } catch (error) {
          console.error("Failed to create/update user record:", error);
          // Don't block login if user creation fails
        }

        // Clear any previous auth errors for valid users
        setAuthError(null);

        // Set up session timeout for new login
        resetSessionTimeout();
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      // Clean up loading timeout
      clearTimeout(loadingTimeout);

      // Clean up event listeners
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      // Clean up subscription
      subscription.unsubscribe();

      // Clean up session timeout
      if (sessionTimeout) {
        clearTimeout(sessionTimeout);
      }
    };
  }, [sessionTimeout, trackUserActivity]);

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
    // Clear session timeout
    if (sessionTimeout) {
      clearTimeout(sessionTimeout);
      setSessionTimeout(null);
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error.message);
    }
    // Clear auth error on sign out
    setAuthError(null);
  };

  const value = {
    user,
    session,
    loading,
    signInWithGoogle,
    signOut,
    authError,
  };

  // Calculate time remaining for session timeout warning
  const timeRemaining = sessionStartTime
    ? Math.max(0, SESSION_TIMEOUT_DURATION - (Date.now() - sessionStartTime))
    : 0;

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
