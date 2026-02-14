-- Chat Messages Table
-- This table stores all chat messages for logging and optional history retrieval
-- Run this SQL in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read
CREATE POLICY "Allow all users to read chat messages"
  ON chat_messages
  FOR SELECT
  USING (true);

-- Create policy to allow all users to insert chat messages
CREATE POLICY "Allow all users to insert chat messages"
  ON chat_messages
  FOR INSERT
  WITH CHECK (true);

-- Optional: Add a policy to allow users to delete their own messages
-- Uncomment if needed:
-- CREATE POLICY "Users can delete their own messages"
--   ON chat_messages
--   FOR DELETE
--   USING (sender = current_user);
