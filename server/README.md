# Signaling Server

A lightweight WebRTC signaling server for one-to-one live streaming, built with Express and Socket.IO.

## Features

- Room-based signaling for one broadcaster and one viewer
- Relays WebRTC `offer`, `answer`, and `ice-candidate` messages
- Automatic peer disconnect notifications
- CORS support (configurable via environment variable)
- Health check endpoint

## Local Development

```bash
cd server
npm install
npm start
```

The server starts on `http://localhost:3001` by default.

### Environment Variables

| Variable      | Default | Description                                |
| ------------- | ------- | ------------------------------------------ |
| `PORT`        | `3001`  | Port the server listens on                 |
| `CORS_ORIGIN` | `*`     | Allowed CORS origin (use `*` for any)      |

## API

### HTTP Endpoints

- `GET /` — Returns server status
- `GET /health` — Returns server status and active room count

### Socket.IO Events

#### Client → Server

| Event           | Payload                                                        | Description                     |
| --------------- | -------------------------------------------------------------- | ------------------------------- |
| `join-room`     | `{ roomId: string, role: 'broadcaster' \| 'viewer', peerId?: string }` | Join a room as broadcaster or viewer |
| `offer`         | WebRTC offer object                                            | Relay SDP offer to peer         |
| `answer`        | WebRTC answer object                                           | Relay SDP answer to peer        |
| `ice-candidate` | ICE candidate object                                           | Relay ICE candidate to peer     |

#### Server → Client

| Event               | Payload                                      | Description                                |
| ------------------- | -------------------------------------------- | ------------------------------------------ |
| `broadcaster-ready` | `{ broadcasterId: string, peerId?: string }` | Sent to viewer when broadcaster is present |
| `viewer-joined`     | `{ viewerId: string, peerId?: string }`      | Sent to broadcaster when viewer joins      |
| `peer-disconnected` | `{ peerId: string, role: string }`           | Sent when the other peer disconnects       |
| `error-message`     | `{ message: string }`                        | Sent on invalid input                      |

## Deploying to Render.com

1. Push this repository to GitHub.

2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New → Web Service**.

3. Connect your GitHub repository.

4. Configure the service:
   - **Name**: `camera-dashcam-signaling` (or your preferred name)
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

5. Add environment variables (optional):
   - `CORS_ORIGIN` — Set to your frontend URL for stricter CORS (e.g., `https://your-app.vercel.app`)
   - `PORT` is automatically set by Render; no need to add it manually.

6. Click **Deploy Web Service**.

Your signaling server will be available at the URL Render provides (e.g., `https://camera-dashcam-signaling.onrender.com`).
