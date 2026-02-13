// Centralized PeerJS configuration and utilities
// HTTPS note: WebRTC requires secure contexts (HTTPS).
// - Vercel deploys provide HTTPS automatically
// - For local development, use localhost or ngrok/cloudflare tunnel

export const PEER_CONFIG = {
  // Use the default PeerJS cloud server for signaling
  // In production, you may want to run your own PeerServer
  debug: process.env.NODE_ENV === "development" ? 2 : 0,
} as const;

export function validatePeerId(id: string): boolean {
  // Alphanumeric, 3-64 characters (PeerJS constraints)
  return /^[a-zA-Z0-9]{3,64}$/.test(id);
}
