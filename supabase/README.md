# Supabase Setup for Chat Message Logging

This directory contains the database schema for logging chat messages to Supabase.

## Setup Instructions

1. **Create a Supabase Account**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project

2. **Run the Schema**
   - Navigate to your Supabase project dashboard
   - Go to the SQL Editor
   - Copy and paste the contents of `schema.sql`
   - Click "Run" to create the table and policies

3. **Configure Environment Variables**
   - Copy your project URL and anon/public key from Supabase dashboard
   - Update `.env.local` with:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

## Table Structure

The `chat_messages` table stores:
- `id`: Auto-incrementing primary key
- `message_id`: Unique message identifier from Ably
- `sender`: Username of the message sender
- `text`: Message content
- `timestamp`: Unix timestamp of when the message was sent
- `created_at`: Database timestamp of when the record was created

## Row Level Security (RLS)

The table has RLS enabled with policies that:
- Allow all users to read messages
- Allow all users to insert messages
- Optional: Allow users to delete their own messages (commented out)

## Notes

- Messages are logged asynchronously and failures won't interrupt the chat
- The chat still works without Supabase (messages just won't be persisted)
- Messages in the current session are volatile (per requirements)
- Supabase logging is for auditing/analytics purposes only
