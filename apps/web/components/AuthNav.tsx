'use client';

/**
 * Header auth control. Renders Clerk's sign-in button (signed out) or the user
 * menu (signed in) — but only when auth is configured. With no Clerk keys
 * (CI / e2e / zero-env local) it renders nothing, so those flows are unchanged.
 */
import { SignInButton, UserButton, useAuth } from '@clerk/nextjs';
import { authEnabled } from '../lib/auth';

function AuthNavInner() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? (
    <UserButton />
  ) : (
    <SignInButton mode="modal">
      <button className="deep-link mono" data-testid="sign-in">
        sign in
      </button>
    </SignInButton>
  );
}

export default function AuthNav() {
  // Gate on key presence so the Clerk hook (which needs ClerkProvider) never
  // runs in the keyless configuration.
  if (!authEnabled()) return null;
  return <AuthNavInner />;
}
