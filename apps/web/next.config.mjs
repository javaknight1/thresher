import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import { readFileSync } from 'node:fs';

// Version of record = the root package.json "version" (see RELEASING.md). Read
// it at build time and inline it so the UI (footer) can show the running
// version without importing across the workspace boundary at runtime.
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@thresher/engine'],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

// Lets `next dev` access Cloudflare bindings locally (no-op when none are bound).
initOpenNextCloudflareForDev();

export default nextConfig;
