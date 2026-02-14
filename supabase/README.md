# Supabase Setup for Chat and Authentication

This directory contains the database schema for chat message logging and authentication setup for Forsyth Time.

## Setup Instructions

### 1. Create a Supabase Account
- Go to [supabase.com](https://supabase.com)
- Create a new project

### 2. Enable Email Authentication
- In your Supabase project dashboard, go to **Authentication** > **Providers**
- Enable **Email** provider
- Configure email templates if desired
- Note: Email confirmation is enabled by default

### 3. Configure Redirect URLs
- Go to **Authentication** > **URL Configuration**
- Add the appropriate redirect URLs for your environment
- **See `REDIRECT_URLS.md` for detailed configuration**
- For local development, add: `http://localhost:3000/time`
- For production, add: `https://yourdomain.com/time`

### 4. Run the Database Schema
- Navigate to your Supabase project dashboard
- Go to the **SQL Editor**
- Copy and paste the contents of `schema.sql`
- Click **Run** to create the table and policies

### 5. Configure Environment Variables
Update `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key
SUPABASE_DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
```

You can find these values in:
- **Project URL**: Settings > API > Project URL
- **Anon Key**: Settings > API > Project API keys > anon/public
- **Database URL**: Settings > Database > Connection string > URI

## Authentication Features

- **Email/Password Authentication**: Users can sign up and log in with email and password
- **Email Verification**: Supabase sends confirmation emails (can be disabled in settings)
- **Session Management**: Automatic session handling with local storage persistence
- **User Metadata**: Username and display name stored in user metadata

## Chat Message Logging

### Table Structure

The `chat_messages` table stores:
- `id`: Auto-incrementing primary key
- `message_id`: Unique message identifier from Ably
- `sender`: Username of the message sender
- `text`: Message content
- `timestamp`: Unix timestamp of when the message was sent
- `created_at`: Database timestamp of when the record was created

### Row Level Security (RLS)

The table has RLS enabled with policies that:
- Allow all users to read messages
- Allow all users to insert messages
- Optional: Allow users to delete their own messages (commented out)

## Usage

### Sign Up
1. Navigate to the Chat tab
2. Click "Sign Up"
3. Enter username, email, and password (min 6 characters)
4. Check your email for verification link (if email confirmation is enabled)
5. Once verified, log in

### Log In
1. Navigate to the Chat tab
2. Enter your email and password
3. Click "Sign In"

### Chat
- Messages are sent in real-time via Ably
- All messages are logged to Supabase for persistence
- Translation feed shows messages (future: will show translated versions)
- Messages are moderated for profanity before sending

## Notes

- Authentication works with static export using client-side Supabase SDK
- Messages are logged asynchronously; failures won't interrupt chat
- Chat history is volatile in the current session (per requirements)
- Supabase logging is for auditing/analytics purposes
- User sessions persist in browser local storage
