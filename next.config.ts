import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'a.espncdn.com' },
      { protocol: 'https', hostname: 'midfield.mlbstatic.com' },
      { protocol: 'https', hostname: 'cdn.nba.com' },
    ],
  },
};

export default nextConfig;
