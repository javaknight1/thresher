/**
 * Auth middleware. When Clerk keys are present it protects the app + API and
 * sends signed-in users from the marketing landing (/) straight to /app. When
 * keys are absent (CI / e2e / zero-env local) it is a pass-through, so the app
 * runs open exactly as before.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/app(.*)',
  '/analyze(.*)',
  '/dashboard(.*)',
  '/api/v1/(.*)',
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  // Signed-in users at the landing page go straight to the board.
  if (userId && req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/app', req.url));
  }
  if (isProtected(req)) await auth.protect();
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and files with an extension…
    '/((?!_next|[^?]*\\.[^?]*$).*)',
    // …and always on API routes.
    '/(api|trpc)(.*)',
  ],
};
