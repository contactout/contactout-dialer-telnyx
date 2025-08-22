-- Create users table for tracking user statistics
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

-- Create calls table for tracking individual calls
CREATE TABLE IF NOT EXISTS calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'missed', 'incoming')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duration INTEGER, -- in seconds
  call_control_id TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_total_calls ON users(total_calls DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view their own stats" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own stats" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own stats" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create policies for calls table
CREATE POLICY "Users can view their own calls" ON calls
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calls" ON calls
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admin policy (for users with admin role)
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (email LIKE '%admin%' OR raw_user_meta_data->>'role' = 'admin')
    )
  );

CREATE POLICY "Admins can view all calls" ON calls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = auth.uid() 
      AND (email LIKE '%admin%' OR raw_user_meta_data->>'role' = 'admin')
    )
  );

-- Function to automatically update user stats when calls are inserted
CREATE OR REPLACE FUNCTION update_user_stats_on_call()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user stats when a new call is inserted
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

-- Create trigger to automatically update user stats
CREATE TRIGGER trigger_update_user_stats_on_call
  AFTER INSERT ON calls
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_on_call();
