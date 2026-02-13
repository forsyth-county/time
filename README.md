# LiveStream – Real-time Phone to Desktop Streaming

A modern Next.js web application that enables a mobile phone to live-stream its camera in real-time to a desktop browser using WebRTC with PeerJS for signaling. No custom backend required—everything is client-side.

## Features

- **WebRTC Streaming** – Low-latency video + audio streaming via PeerJS
- **Mobile Broadcaster** – Uses the phone's rear camera with controls for mute, switch camera, and fullscreen
- **Desktop Viewer** – Connect with a Peer ID to view the live stream
- **QR Code** – Auto-generated QR code for easy ID sharing
- **Glassmorphism UI** – Frosted glass cards with animated grid background
- **Framer Motion** – Smooth animations and transitions throughout
- **Dark Mode** – Beautiful dark-only theme with cyber/tech aesthetic
- **Mobile-first** – Responsive design with touch-friendly controls

## Tech Stack

- Next.js (App Router) with TypeScript
- PeerJS for WebRTC signaling
- Tailwind CSS
- Framer Motion
- shadcn/ui components
- Radix UI primitives
- lucide-react icons
- qrcode.react

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Usage

1. Open the app on your **phone** → it defaults to **Broadcaster** mode
2. The app generates a unique Peer ID and QR code
3. Start your camera
4. Open the app on your **desktop** → it defaults to **Viewer** mode
5. Enter the Peer ID (or scan QR) and click **Connect**
6. Enjoy the live stream!

> **Note:** WebRTC requires HTTPS. When deployed on Vercel, HTTPS is automatic. For local dev, use `localhost` or an ngrok/tunnel.
