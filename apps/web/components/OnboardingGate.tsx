'use client';

/**
 * Shows the onboarding wizard once, on a user's first visit after signing up.
 * "First time" = no `onboardedAt` in Clerk unsafeMetadata (a flag we own — more
 * reliable than createdAt, since a user can sign up and bounce before finishing).
 * Setting the flag on close means they never see it again, across devices.
 *
 * No-ops when auth is off (keyless / CI), so it never blocks those flows.
 */
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { authEnabled } from '../lib/auth';
import { seedDefaultFollows } from '../lib/follows-client';
import { WEB_CONFIG } from '../lib/config';
import OnboardingWizard from './OnboardingWizard';

function OnboardingGateInner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn && user && !user.unsafeMetadata?.onboardedAt) {
      setOpen(true);
    }
  }, [isLoaded, isSignedIn, user]);

  if (!open) return null;

  const close = async () => {
    setOpen(false);
    // Seed a starter watchlist so the new user's board isn't empty on day one
    // (fully follow-driven — no default board otherwise). Best-effort.
    void seedDefaultFollows(WEB_CONFIG.follows.defaultWatchlist);
    try {
      await user?.update({
        unsafeMetadata: { ...(user.unsafeMetadata ?? {}), onboardedAt: new Date().toISOString() },
      });
    } catch {
      // Best-effort: if the flag write fails, worst case they see it again.
    }
  };

  return <OnboardingWizard onClose={close} />;
}

export default function OnboardingGate() {
  if (!authEnabled()) return null;
  return <OnboardingGateInner />;
}
