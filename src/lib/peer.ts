// Centralized WebRTC configuration
// Signaling is handled by our own Socket.IO server (no PeerJS dependency).
// WebRTC requires secure contexts (HTTPS).
// - Vercel deploys provide HTTPS automatically
// - For local development, use localhost or ngrok/cloudflare tunnel

const METERED_API_KEY = "54d304f2c2fd4f2a508f928fd807875f83cd";
const METERED_DOMAIN = "forsythcounty.metered.live";

// Fallback ICE servers used while fetching Metered credentials or if the fetch fails
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: `stun:${METERED_DOMAIN}:80` },
  {
    urls: `turn:${METERED_DOMAIN}:80`,
    username: "c91bea0cfdb363554b2a2c46",
    credential: "GTGAFpemuGlYUuwW",
  },
  {
    urls: `turn:${METERED_DOMAIN}:443`,
    username: "c91bea0cfdb363554b2a2c46",
    credential: "GTGAFpemuGlYUuwW",
  },
  {
    urls: `turn:${METERED_DOMAIN}:443?transport=tcp`,
    username: "c91bea0cfdb363554b2a2c46",
    credential: "GTGAFpemuGlYUuwW",
  },
  {
    urls: `turns:${METERED_DOMAIN}:443`,
    username: "c91bea0cfdb363554b2a2c46",
    credential: "GTGAFpemuGlYUuwW",
  },
];

// Cache fetched ICE servers so we don't call the API on every connection
let cachedIceServers: RTCIceServer[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours — Metered credentials rotate

/**
 * Fetch fresh TURN credentials from the Metered REST API.
 * Falls back to hardcoded credentials if the API is unreachable.
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  // Return cached servers if still fresh
  if (cachedIceServers && Date.now() - cacheTimestamp < CACHE_TTL) {
    console.debug("[ICE] Using cached ICE servers, age:", Math.round((Date.now() - cacheTimestamp) / 1000), "s");
    return cachedIceServers;
  }

  try {
    console.debug("[ICE] Fetching TURN credentials from Metered API…");
    const response = await fetch(
      `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Metered API returned ${response.status}`);
    }

    const metered: RTCIceServer[] = await response.json();
    console.debug("[ICE] ✅ Fetched", metered.length, "ICE servers from Metered API");
    metered.forEach((s, i) => console.debug(`[ICE]   [${i}]`, JSON.stringify(s)));

    // Prepend Google STUN for reliability
    cachedIceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      ...metered,
    ];
    cacheTimestamp = Date.now();
    return cachedIceServers;
  } catch (err) {
    console.warn("[ICE] ⚠️ Failed to fetch Metered TURN credentials, using fallback:", err);
    return FALLBACK_ICE_SERVERS;
  }
}

/**
 * Build an RTCConfiguration with fresh TURN credentials.
 * Call this before creating each RTCPeerConnection.
 */
export async function getRTCConfig(): Promise<RTCConfiguration> {
  const iceServers = await fetchIceServers();
  return { iceServers };
}

// Synchronous fallback config (used where async isn't possible)
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: FALLBACK_ICE_SERVERS,
};

export function validateBroadcastId(id: string): boolean {
  // Alphanumeric, 3-64 characters
  return /^[a-zA-Z0-9]{3,64}$/.test(id);
}
