// Centralized PeerJS configuration and utilities
// Uses PeerJS's free cloud signaling server (0.peerjs.com)
// WebRTC requires secure contexts (HTTPS).
// - Vercel deploys provide HTTPS automatically
// - For local development, use localhost or ngrok/cloudflare tunnel

export const PEER_CONFIG = {
  // Use PeerJS free cloud server for signaling (default)
  // No custom server needed — reliable and always-on
  debug: 2, // Enable all debug logs
} as const;

export function validatePeerId(id: string): boolean {
  // Alphanumeric, 3-64 characters (PeerJS constraints)
  return /^[a-zA-Z0-9]{3,64}$/.test(id);
}
