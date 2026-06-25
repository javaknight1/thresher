import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@thresher/engine'],
};

// Lets `next dev` access Cloudflare bindings locally (no-op when none are bound).
initOpenNextCloudflareForDev();

export default nextConfig;
