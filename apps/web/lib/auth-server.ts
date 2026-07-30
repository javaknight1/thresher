/**
 * Server-only auth helper for the API routes: resolve the rate-limit identity
 * and tier. Signed-in requests are keyed by the Clerk userId at the authed tier
 * (200/hr); everyone else by IP at the anon tier (20/hr). Falls back to IP when
 * Clerk isn't configured, so keyless (CI / e2e / zero-env) is unchanged.
 *
 * Kept separate from lib/auth.ts (which is client-safe) because it imports the
 * Clerk server SDK.
 */
import { auth } from '@clerk/nextjs/server';
import { authEnabled } from './auth';

function ipOf(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

export async function requestIdentity(req: Request): Promise<{ identity: string; authed: boolean }> {
  if (authEnabled()) {
    try {
      const { userId } = await auth();
      if (userId) return { identity: userId, authed: true };
    } catch {
      // No Clerk context (shouldn't happen for a protected route) — fall through.
    }
  }
  return { identity: ipOf(req), authed: false };
}
