import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

/**
 * OpenNext → Cloudflare Workers adapter config (replaces next-on-pages, which
 * can't run yahoo-finance2's Node build on the edge runtime).
 *
 * R2 incremental cache: the methodology pages are prerendered via
 * generateStaticParams (SSG), and OpenNext serves prerendered routes from this
 * cache. The build/deploy step uploads the prerendered output into the bucket
 * (binding NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc). Without it those routes
 * 404. We have no revalidating (ISR) pages, so the cache is effectively
 * write-once at deploy.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
