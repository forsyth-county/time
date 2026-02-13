// Centralized PeerJS configuration and utilities
// HTTPS note: WebRTC requires secure contexts (HTTPS).
// - Vercel deploys provide HTTPS automatically
// - For local development, use localhost or ngrok/cloudflare tunnel

export const PEER_CONFIG = {
  // Use custom signaling server
  host: 'forsythtime.onrender.com',
  port: 443,
  path: '/peerjs',
  secure: true,
  debug: (typeof window !== 'undefined' && window.location.hostname === 'localhost') ? 2 : 0,
} as const;

export function validatePeerId(id: string): boolean {
  // Alphanumeric, 3-64 characters (PeerJS constraints)
  return /^[a-zA-Z0-9]{3,64}$/.test(id);
}
