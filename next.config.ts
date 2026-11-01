import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

if (basePath && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
  throw new Error('NEXT_PUBLIC_BASE_PATH must start with "/" and omit a trailing slash.');
}

// Inlined so client components that format Canvas/Handshake dates use the same zone as the server.
const env = { APER_TIME_ZONE: process.env.APER_TIME_ZONE ?? '' };

const nextConfig: NextConfig = basePath ? { basePath, env } : { env };

export default nextConfig;
