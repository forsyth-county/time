// Centralized WebRTC configuration
// Signaling is handled by our own Socket.IO server (no PeerJS dependency).
// WebRTC requires secure contexts (HTTPS).
// - Vercel deploys provide HTTPS automatically
// - For local development, use localhost or ngrok/cloudflare tunnel

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // Google public STUN servers (free, reliable)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function validateBroadcastId(id: string): boolean {
  // Alphanumeric, 3-64 characters
  return /^[a-zA-Z0-9]{3,64}$/.test(id);
}
