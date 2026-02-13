import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https://forsythtime.onrender.com wss://forsythtime.onrender.com https://*.onrender.com wss://*.onrender.com https://*.vercel.app wss://*.vercel.app ws://localhost:* http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
