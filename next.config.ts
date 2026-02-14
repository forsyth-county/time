import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/time",
  assetPrefix: "/time/",
  // Removed output: "export" to support Server Components and API routes for Clerk and Ably
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.hcaptcha.com https://*.hcaptcha.com https://*.clerk.accounts.dev; connect-src 'self' https://forsythtime.onrender.com wss://forsythtime.onrender.com https://*.onrender.com wss://*.onrender.com https://*.vercel.app wss://*.vercel.app ws://localhost:* http://localhost:* https://*.hcaptcha.com https://*.clerk.accounts.dev https://*.ably.io wss://*.ably.io https://*.supabase.co; style-src 'self' 'unsafe-inline' https://*.hcaptcha.com https://*.clerk.accounts.dev; img-src 'self' data: blob: https://*.hcaptcha.com https://*.clerk.accounts.dev; media-src 'self' blob:; frame-src https://*.hcaptcha.com https://*.clerk.accounts.dev;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
