-- Initial database schema setup
-- This migration creates the basic tables and policies needed for the application

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    failed_calls INTEGER DEFAULT 0,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_voice_cost DECIMAL(10,6) DEFAULT 0,
    total_sip_trunking_cost DECIMAL(10,6) DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0
);

-- Create calls table
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'failed', 'missed')),
    duration INTEGER, -- in seconds
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    voice_cost DECIMAL(10,6) DEFAULT 0,
    sip_trunking_cost DECIMAL(10,6) DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    destination_country TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
-- Users can read their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own data
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own data
CREATE POLICY "Users can insert own data" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can view all user data
CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Admins can update all user data
CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Create RLS policies for calls table
-- Users can view their own calls
CREATE POLICY "Users can view own calls" ON calls
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own calls
CREATE POLICY "Users can insert own calls" ON calls
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own calls
CREATE POLICY "Users can update own calls" ON calls
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all calls
CREATE POLICY "Admins can view all calls" ON calls
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Admins can update all calls
CREATE POLICY "Admins can update all calls" ON calls
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Create function to update user stats when calls are inserted/updated
CREATE OR REPLACE FUNCTION update_user_stats_on_call()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user stats when a new call is inserted or updated
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
        total_cost = users.total_cost + COALESCE(NEW.total_cost, 0),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update user stats
DROP TRIGGER IF EXISTS trigger_update_user_stats ON calls;
CREATE TRIGGER trigger_update_user_stats
    AFTER INSERT OR UPDATE ON calls
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_on_call();

-- Create function to automatically create user record when auth.users record is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user record
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON users TO authenticated;
GRANT ALL ON calls TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
