-- Migration: Enhance calls table with native Telnyx event data
-- Run this in your Supabase SQL editor to add the new columns

-- Add new columns to the calls table for native Telnyx events
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS hangup_cause TEXT,
ADD COLUMN IF NOT EXISTS hangup_source TEXT,
ADD COLUMN IF NOT EXISTS call_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_connected_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS telnyx_call_id TEXT,
ADD COLUMN IF NOT EXISTS telnyx_leg_id TEXT,
ADD COLUMN IF NOT EXISTS call_quality_score INTEGER,
ADD COLUMN IF NOT EXISTS network_quality TEXT CHECK (network_quality IN ('excellent', 'good', 'fair', 'poor')),
ADD COLUMN IF NOT EXISTS voice_mail_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS machine_answer BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS amd_result TEXT CHECK (amd_result IN ('human', 'machine', 'not_sure')),
ADD COLUMN IF NOT EXISTS sip_response_code INTEGER,
ADD COLUMN IF NOT EXISTS sip_response_text TEXT,
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_calls_hangup_cause ON calls(hangup_cause);
CREATE INDEX IF NOT EXISTS idx_calls_hangup_source ON calls(hangup_source);
CREATE INDEX IF NOT EXISTS idx_calls_telnyx_call_id ON calls(telnyx_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_voice_mail_detected ON calls(voice_mail_detected);
CREATE INDEX IF NOT EXISTS idx_calls_network_quality ON calls(network_quality);
CREATE INDEX IF NOT EXISTS idx_calls_call_start_time ON calls(call_start_time);

-- Add comments to document the new columns
COMMENT ON COLUMN calls.hangup_cause IS 'Native Telnyx hangup cause: call_rejected, busy, no_answer, normal_clearing, etc.';
COMMENT ON COLUMN calls.hangup_source IS 'Who initiated the hangup: caller, callee, system';
COMMENT ON COLUMN calls.call_start_time IS 'When the call was initiated';
COMMENT ON COLUMN calls.call_connected_time IS 'When the call was answered/connected';
COMMENT ON COLUMN calls.call_end_time IS 'When the call ended';
COMMENT ON COLUMN calls.telnyx_call_id IS 'Telnyx internal call ID';
COMMENT ON COLUMN calls.telnyx_leg_id IS 'Telnyx call leg ID';
COMMENT ON COLUMN calls.call_quality_score IS 'Call quality score (0-100)';
COMMENT ON COLUMN calls.network_quality IS 'Network quality during call';
COMMENT ON COLUMN calls.voice_mail_detected IS 'Whether voice mail was detected by Telnyx';
COMMENT ON COLUMN calls.machine_answer IS 'Whether machine answer was detected';
COMMENT ON COLUMN calls.amd_result IS 'Answering Machine Detection result';
COMMENT ON COLUMN calls.sip_response_code IS 'SIP response code';
COMMENT ON COLUMN calls.sip_response_text IS 'SIP response text';
COMMENT ON COLUMN calls.error_code IS 'Error code if call failed';
COMMENT ON COLUMN calls.error_message IS 'Error message if call failed';

-- Create a view for call analytics with native event data
CREATE OR REPLACE VIEW call_analytics AS
SELECT 
    user_id,
    phone_number,
    status,
    duration,
    hangup_cause,
    hangup_source,
    voice_mail_detected,
    machine_answer,
    amd_result,
    network_quality,
    call_quality_score,
    sip_response_code,
    error_code,
    timestamp,
    call_start_time,
    call_connected_time,
    call_end_time,
    voice_cost,
    sip_trunking_cost,
    total_cost,
    destination_country
FROM calls
ORDER BY timestamp DESC;

-- Create a view for call failure analysis
CREATE OR REPLACE VIEW call_failure_analysis AS
SELECT 
    hangup_cause,
    hangup_source,
    error_code,
    sip_response_code,
    COUNT(*) as failure_count,
    AVG(duration) as avg_duration,
    COUNT(*) FILTER (WHERE voice_mail_detected = true) as voice_mail_count,
    COUNT(*) FILTER (WHERE machine_answer = true) as machine_answer_count
FROM calls
WHERE status = 'failed'
GROUP BY hangup_cause, hangup_source, error_code, sip_response_code
ORDER BY failure_count DESC;

-- Create a view for voice mail analysis
CREATE OR REPLACE VIEW voice_mail_analysis AS
SELECT 
    user_id,
    phone_number,
    duration,
    amd_result,
    machine_answer,
    voice_mail_detected,
    call_start_time,
    call_connected_time,
    call_end_time,
    timestamp
FROM calls
WHERE voice_mail_detected = true OR machine_answer = true OR amd_result = 'machine'
ORDER BY timestamp DESC;
