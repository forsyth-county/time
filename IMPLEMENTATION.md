# Forsyth Time - Real-Time Dashboard Implementation

This document describes the complete implementation of the Next.js Real-Time Dashboard with hCaptcha, Ably Chat, Supabase Authentication, and live translation/moderation features.

## Features Implemented

### ✅ 1. hCaptcha Dark Theme & State Fix
- Added `theme="dark"` prop to hCaptcha component
- Integrated hCaptcha verification with React state
- Server-side validation via `/api/verify-captcha` endpoint
- Dark-themed captcha matches the glassmorphism UI

### ✅ 2. Real-Time Chat with Ably
- **Technology**: React Client Components + Ably Chat SDK (`@ably/chat`)
- **Volatile Stream**: Messages exist only in current session (no persistence by default)
- **Authentication**: Supabase Auth (email/password)
- **User Identity**: Only username is broadcasted in chat
- **UI Features**:
  - Message bubbles (right-aligned for self, left-aligned for others)
  - Automatic scroll-to-bottom using `useRef`
  - Dark-theme compatible glassmorphism styling
  - Connection status indicator
  - User logout button

### ✅ 3. Live Translation & Moderation
- **Left Panel**: Parallel translated feed display
- **Translation**: Placeholder wrapper for Google Translate/DeepL API (`lib/translate.ts`)
- **Moderation**: Client-side profanity filter using `bad-words` library
- **Flow**: Messages are moderated before broadcasting to Ably

### ✅ 4. Supabase Integration
- **Authentication**: Email/password signup and login
- **Message Logging**: All chat messages logged to `chat_messages` table
- **Session Management**: Persistent sessions with auto-refresh
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Credentials**: Hardcoded in `src/lib/supabase.ts` for production use

### ✅ 5. Modern Glass UI Design
- **Dark Theme**: Full dark mode with glassmorphism effects
- **Components**: Modern cards with glass backdrop-filter blur
- **Toast Notifications**: Success, error, and info toasts
- **Animations**: Smooth transitions using Framer Motion
- **Responsive**: Mobile-first design with Tailwind CSS

## Architecture

### Static Export
The application uses Next.js static export (`output: "export"`) which means:
- All pages are pre-rendered at build time
- No server-side rendering or API routes at runtime
- Client-side authentication and real-time features
- Can be deployed to any static hosting (Vercel, Netlify, GitHub Pages)

### Authentication Flow
1. User visits the Chat tab
2. If not authenticated, sees login/signup form with glassmorphism styling
3. Signs up with email, password, and username
4. Supabase sends verification email
5. After verification, user can log in
6. Session persists in browser localStorage
7. User can logout which clears the session

### Chat Flow
1. Authenticated user enters a message
2. Message is moderated for profanity (client-side)
3. If clean, message is sent to Ably Chat room
4. Ably broadcasts to all connected users
5. Message is logged to Supabase asynchronously
6. Translation wrapper processes message (placeholder for now)
7. Message appears in both main chat and translated feed

### Message Logging
- Messages are logged to Supabase PostgreSQL database
- Logging is asynchronous and doesn't block chat
- Failed logging doesn't interrupt user experience
- Useful for analytics, moderation review, and audit trails

## Technology Stack

### Frontend
- **Framework**: Next.js 16.1.6 (App Router, Turbopack)
- **React**: 19.2.3
- **Styling**: Tailwind CSS 4 with custom glassmorphism
- **Animations**: Framer Motion 12.34.0
- **Icons**: Lucide React
- **UI Components**: Custom components with Radix UI primitives

### Real-Time & Chat
- **Chat SDK**: Ably Chat SDK (`@ably/chat` v1.1.1)
- **Real-Time**: Ably Realtime (`ably`)

### Authentication & Database
- **Auth Provider**: Supabase Auth
- **Database**: Supabase PostgreSQL
- **Client**: `@supabase/supabase-js` with SSR support

### Security & Validation
- **Bot Protection**: hCaptcha (`@hcaptcha/react-hcaptcha`)
- **Content Moderation**: bad-words library
- **Server Validation**: hCaptcha server-side verification

### WebRTC (Existing)
- **Signaling**: Socket.IO client
- **Peer Connection**: PeerJS (existing implementation)

## Configuration

### Environment Variables
The following are configured in `.env.local`:

```bash
# Ably Real-time Chat (hardcoded in src/components/ChatComponent.tsx)
# NEXT_PUBLIC_ABLY_API_KEY=pnOXuA.eA-Lwg:2_EVRGu8j2HGFlHlvbxi48LSWM5JI920L8RaWX_0bHE

# Socket.IO signaling (for WebRTC)
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# hCaptcha
NEXT_PUBLIC_HCAPTCHA_SITE_KEY=e88ae612-2144-47f6-beb2-25927afc0d0c

# Supabase (hardcoded in src/lib/supabase.ts)
# NEXT_PUBLIC_SUPABASE_URL=https://mvnuqandwrnrfhossjdc.supabase.co
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_4fhIXnpB06zOzkGrcoijdg_N8fOGUy9
```

### Supabase Setup
See `supabase/README.md` for complete setup instructions:
1. Create Supabase project
2. Enable email authentication
3. Configure redirect URLs (see `supabase/REDIRECT_URLS.md`)
4. Run SQL schema (`supabase/schema.sql`)
5. Credentials are hardcoded in the app

### Ably Setup
The Ably API key is **hardcoded** in `src/components/ChatComponent.tsx`:
```typescript
const apiKey = "pnOXuA.eA-Lwg:2_EVRGu8j2HGFlHlvbxi48LSWM5JI920L8RaWX_0bHE";
```
No additional setup is required.

## File Structure

```
src/
├── app/
│   ├── api/
│   │   └── verify-captcha/
│   │       └── route.ts          # hCaptcha server verification
│   ├── globals.css               # Dark theme + glassmorphism styles
│   ├── layout.tsx                # Root layout with AuthProvider
│   └── page.tsx                  # Main page with tabs (Broadcaster/Viewer/Chat)
├── components/
│   ├── Broadcaster.tsx           # WebRTC broadcaster with hCaptcha dark theme
│   ├── ChatComponent.tsx         # Real-time chat with Ably
│   ├── LoginForm.tsx             # Supabase auth login/signup form
│   └── ui/                       # Shadcn/ui components (cards, buttons, etc.)
├── lib/
│   ├── auth.tsx                  # Supabase auth context provider
│   ├── moderate.ts               # Client-side profanity filter
│   ├── supabase.ts               # Supabase client (hardcoded credentials)
│   └── translate.ts              # Translation wrapper (placeholder)
└── hooks/
    └── use-toast.ts              # Toast notification hook

supabase/
├── README.md                      # Supabase setup guide
├── REDIRECT_URLS.md              # Auth redirect URL configuration
└── schema.sql                    # Database schema for chat_messages

next.config.ts                    # Next.js config with static export
package.json                      # Dependencies
```

## UI Showcase

### Dark Glass Theme
- **Background**: `#0b0b0f` (very dark blue-black)
- **Glass Cards**: Backdrop blur with semi-transparent backgrounds
- **Borders**: Subtle white borders with low opacity
- **Shadows**: Deep shadows for depth
- **Accents**: Blue (#5b8cff) primary color
- **Glow Effects**: Soft glows on interactive elements

### Components
1. **Login/Signup Form**: Glassmorphism card with tabbed interface
2. **Chat Panel**: Two-column layout (main chat + translated feed)
3. **Message Bubbles**: Rounded, colored bubbles with timestamps
4. **Status Indicators**: Connection status, typing indicators
5. **Toast Notifications**: Bottom-right positioned toasts

## Deployment

### Build Command
```bash
npm run build
```

### Output
- Static files in `out/` directory
- Can be deployed to any static host
- Base path: `/time`

### Deployment Platforms
- **Vercel**: Automatic deployment from GitHub
- **Netlify**: Drag & drop or Git integration
- **GitHub Pages**: Push `out/` directory to gh-pages branch
- **Any CDN**: Upload `out/` directory contents

### Redirect URLs
Configure in Supabase dashboard:
- Local: `http://localhost:3000/time`
- Production: `https://yourdomain.com/time`

## Development

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Lint
```bash
npm run lint
```

## Security Considerations

1. **Supabase Credentials**: Anon/public key is safe to expose (has RLS)
2. **hCaptcha**: Site key is public, secret key in API route
3. **Ably API Key**: Should be kept private in production (use token auth)
4. **Content Moderation**: Client-side only (can be bypassed)
5. **Message Logging**: All messages stored in Supabase database

## Future Enhancements

1. **Live Translation**: Integrate Google Translate or DeepL API
2. **Advanced Moderation**: Use OpenAI Moderation API
3. **Message Reactions**: Add emoji reactions to messages
4. **Typing Indicators**: Show when users are typing
5. **Read Receipts**: Track message read status
6. **File Sharing**: Upload and share files in chat
7. **User Presence**: Show online/offline status
8. **Chat Rooms**: Multiple chat rooms support

## Notes

- Messages in the current session are volatile (cleared on refresh)
- Supabase logging is for persistence/analytics
- Translation is a placeholder (returns original text)
- Static export means no server-side features
- All auth and chat happens client-side
- Works offline for authenticated users (with cached session)

## Support

For issues or questions:
1. Check `supabase/README.md` for setup help
2. Check `supabase/REDIRECT_URLS.md` for auth config
3. Review build logs for errors
4. Check browser console for runtime issues
