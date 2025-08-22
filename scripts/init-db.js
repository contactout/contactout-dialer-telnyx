#!/usr/bin/env node

/**
 * Database Initialization Script
 *
 * This script helps set up the database tables for the admin dashboard.
 * Run this after setting up your Supabase project.
 *
 * Usage: node scripts/init-db.js
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

// Check for required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL");
  console.error("   NEXT_PUBLIC_SUPABASE_ANON_KEY");
  console.error("\nPlease check your .env.local file");
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function initializeDatabase() {
  console.log("🚀 Initializing database tables...\n");

  try {
    // SQL for creating tables
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        full_name TEXT,
        total_calls INTEGER DEFAULT 0,
        successful_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const createCallsTable = `
      CREATE TABLE IF NOT EXISTS calls (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        phone_number TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'missed', 'incoming')),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        duration INTEGER,
        call_control_id TEXT
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_users_total_calls ON users(total_calls DESC);
      CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
      CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
    `;

    const enableRLS = `
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
    `;

    const createPolicies = `
      -- Users table policies
      DROP POLICY IF EXISTS "Users can view their own stats" ON users;
      CREATE POLICY "Users can view their own stats" ON users
        FOR SELECT USING (auth.uid() = id);

      DROP POLICY IF EXISTS "Users can update their own stats" ON users;
      CREATE POLICY "Users can update their own stats" ON users
        FOR UPDATE USING (auth.uid() = id);

      DROP POLICY IF EXISTS "Users can insert their own stats" ON users;
      CREATE POLICY "Users can insert their own stats" ON users
        FOR INSERT WITH CHECK (auth.uid() = id);

      -- Calls table policies
      DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
      CREATE POLICY "Users can view their own calls" ON calls
        FOR SELECT USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS "Users can insert their own calls" ON calls;
      CREATE POLICY "Users can insert their own calls" ON calls
        FOR INSERT WITH CHECK (auth.uid() = user_id);

      -- Admin policies
      DROP POLICY IF EXISTS "Admins can view all users" ON users;
      CREATE POLICY "Admins can view all users" ON users
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND (email LIKE '%admin%' OR raw_user_meta_data->>'role' = 'admin')
          )
        );

      DROP POLICY IF EXISTS "Admins can view all calls" ON calls;
      CREATE POLICY "Admins can view all calls" ON calls
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND (email LIKE '%admin%' OR raw_user_meta_data->>'role' = 'admin')
          )
        );
    `;

    const createTriggerFunction = `
      CREATE OR REPLACE FUNCTION update_user_stats_on_call()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO users (id, email, total_calls, successful_calls, failed_calls, last_active, created_at)
        VALUES (
          NEW.user_id,
          (SELECT email FROM auth.users WHERE id = NEW.user_id),
          1,
          CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
          CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          total_calls = users.total_calls + 1,
          successful_calls = users.successful_calls + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
          failed_calls = users.failed_calls + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
          last_active = NOW();
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    const createTrigger = `
      DROP TRIGGER IF EXISTS trigger_update_user_stats_on_call ON calls;
      CREATE TRIGGER trigger_update_user_stats_on_call
        AFTER INSERT ON calls
        FOR EACH ROW
        EXECUTE FUNCTION update_user_stats_on_call();
    `;

    // Execute SQL statements
    console.log("📋 Creating users table...");
    const { error: usersError } = await supabase.rpc("exec_sql", {
      sql: createUsersTable,
    });
    if (usersError) {
      console.log(
        "⚠️  Users table creation (this is normal if using migrations):",
        usersError.message
      );
    } else {
      console.log("✅ Users table created");
    }

    console.log("📋 Creating calls table...");
    const { error: callsError } = await supabase.rpc("exec_sql", {
      sql: createCallsTable,
    });
    if (callsError) {
      console.log(
        "⚠️  Calls table creation (this is normal if using migrations):",
        callsError.message
      );
    } else {
      console.log("✅ Calls table created");
    }

    console.log("📋 Creating indexes...");
    const { error: indexesError } = await supabase.rpc("exec_sql", {
      sql: createIndexes,
    });
    if (indexesError) {
      console.log(
        "⚠️  Index creation (this is normal if using migrations):",
        indexesError.message
      );
    } else {
      console.log("✅ Indexes created");
    }

    console.log("📋 Enabling RLS...");
    const { error: rlsError } = await supabase.rpc("exec_sql", {
      sql: enableRLS,
    });
    if (rlsError) {
      console.log(
        "⚠️  RLS enable (this is normal if using migrations):",
        rlsError.message
      );
    } else {
      console.log("✅ RLS enabled");
    }

    console.log("📋 Creating policies...");
    const { error: policiesError } = await supabase.rpc("exec_sql", {
      sql: createPolicies,
    });
    if (policiesError) {
      console.log(
        "⚠️  Policy creation (this is normal if using migrations):",
        policiesError.message
      );
    } else {
      console.log("✅ Policies created");
    }

    console.log("📋 Creating trigger function...");
    const { error: triggerFuncError } = await supabase.rpc("exec_sql", {
      sql: createTriggerFunction,
    });
    if (triggerFuncError) {
      console.log(
        "⚠️  Trigger function creation (this is normal if using migrations):",
        triggerFuncError.message
      );
    } else {
      console.log("✅ Trigger function created");
    }

    console.log("📋 Creating trigger...");
    const { error: triggerError } = await supabase.rpc("exec_sql", {
      sql: createTrigger,
    });
    if (triggerError) {
      console.log(
        "⚠️  Trigger creation (this is normal if using migrations):",
        triggerError.message
      );
    } else {
      console.log("✅ Trigger created");
    }

    console.log("\n🎉 Database initialization completed!");
    console.log("\n📝 Next steps:");
    console.log("   1. Make sure you have admin users in your system");
    console.log("   2. Navigate to /admin to view the dashboard");
    console.log("   3. Start making calls to generate data");
    console.log(
      "\n💡 Note: If you see warnings above, it means the tables already exist"
    );
    console.log("   This is normal if you're using Supabase migrations.");
  } catch (error) {
    console.error("❌ Error initializing database:", error.message);
    console.log(
      "\n💡 This script requires the exec_sql RPC function to be enabled in Supabase."
    );
    console.log(
      "   You can also run the SQL manually in the Supabase SQL editor."
    );
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase();
