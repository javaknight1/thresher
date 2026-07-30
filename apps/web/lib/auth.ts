/**
 * Auth is enabled only when a Clerk publishable key is present — production
 * (prod instance keys) and local dev (dev instance keys in .env.local). When
 * absent (CI, Playwright e2e, zero-env local runs) the app runs OPEN, exactly
 * as before, so the test suite and the mock-provider flows keep working without
 * any Clerk setup. NEXT_PUBLIC_ vars are inlined at build, so this is safe to
 * call on the server and the client.
 */
export function authEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
