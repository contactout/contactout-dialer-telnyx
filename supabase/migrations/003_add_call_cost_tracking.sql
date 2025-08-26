-- Add call cost tracking columns to calls table
-- Run this to enable cost estimation and tracking for calls

-- Step 1: Add cost-related columns to calls table
DO $$ 
BEGIN
    -- Add voice_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'calls' AND column_name = 'voice_cost') THEN
        ALTER TABLE calls ADD COLUMN voice_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added voice_cost column to calls table';
    ELSE
        RAISE NOTICE 'Voice_cost column already exists';
    END IF;

    -- Add sip_trunking_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'calls' AND column_name = 'sip_trunking_cost') THEN
        ALTER TABLE calls ADD COLUMN sip_trunking_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added sip_trunking_cost column to calls table';
    ELSE
        RAISE NOTICE 'Sip_trunking_cost column already exists';
    END IF;

    -- Add total_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'calls' AND column_name = 'total_cost') THEN
        ALTER TABLE calls ADD COLUMN total_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added total_cost column to calls table';
    ELSE
        RAISE NOTICE 'Total_cost column already exists';
    END IF;

    -- Add currency column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'calls' AND column_name = 'currency') THEN
        ALTER TABLE calls ADD COLUMN currency TEXT DEFAULT 'USD';
        RAISE NOTICE 'Added currency column to calls table';
    ELSE
        RAISE NOTICE 'Currency column already exists';
    END IF;

    -- Add destination_country column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'calls' AND column_name = 'destination_country') THEN
        ALTER TABLE calls ADD COLUMN destination_country TEXT;
        RAISE NOTICE 'Added destination_country column to calls table';
    ELSE
        RAISE NOTICE 'Destination_country column already exists';
    END IF;
END $$;

-- Step 2: Add cost-related columns to users table for aggregated cost tracking
DO $$ 
BEGIN
    -- Add total_voice_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'total_voice_cost') THEN
        ALTER TABLE users ADD COLUMN total_voice_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added total_voice_cost column to users table';
    ELSE
        RAISE NOTICE 'Total_voice_cost column already exists';
    END IF;

    -- Add total_sip_trunking_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'total_sip_trunking_cost') THEN
        ALTER TABLE users ADD COLUMN total_sip_trunking_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added total_sip_trunking_cost column to users table';
    ELSE
        RAISE NOTICE 'Total_sip_trunking_cost column already exists';
    END IF;

    -- Add total_cost column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'total_cost') THEN
        ALTER TABLE users ADD COLUMN total_cost DECIMAL(10,6) DEFAULT 0;
        RAISE NOTICE 'Added total_cost column to users table';
    ELSE
        RAISE NOTICE 'Total_cost column already exists';
    END IF;
END $$;

-- Step 3: Create indexes for better cost query performance
CREATE INDEX IF NOT EXISTS idx_calls_total_cost ON calls(total_cost DESC);
CREATE INDEX IF NOT EXISTS idx_calls_destination_country ON calls(destination_country);
CREATE INDEX IF NOT EXISTS idx_users_total_cost ON users(total_cost DESC);

-- Step 4: Update the trigger function to include cost calculations
CREATE OR REPLACE FUNCTION update_user_stats_on_call()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user stats when a new call is inserted
  INSERT INTO users (id, email, total_calls, successful_calls, failed_calls, last_active, created_at, total_voice_cost, total_sip_trunking_cost, total_cost)
  VALUES (
    NEW.user_id,
    (SELECT email FROM auth.users WHERE id = NEW.user_id),
    1,
    CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    NOW(),
    NOW(),
    COALESCE(NEW.voice_cost, 0),
    COALESCE(NEW.sip_trunking_cost, 0),
    COALESCE(NEW.total_cost, 0)
  )
  ON CONFLICT (id) DO UPDATE SET
    total_calls = users.total_calls + 1,
    successful_calls = users.successful_calls + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
    failed_calls = users.failed_calls + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    last_active = NOW(),
    total_voice_cost = users.total_voice_cost + COALESCE(NEW.voice_cost, 0),
    total_sip_trunking_cost = users.total_sip_trunking_cost + COALESCE(NEW.sip_trunking_cost, 0),
    total_cost = users.total_cost + COALESCE(NEW.total_cost, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Show the updated table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'calls' 
ORDER BY ordinal_position;

-- Step 6: Migration completed
-- The calls and users tables now support cost tracking
-- You can now use the TelnyxCostCalculator to estimate and log call costs
