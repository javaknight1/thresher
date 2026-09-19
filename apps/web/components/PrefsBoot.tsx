'use client';

/**
 * Boots the preferences store on every page: subscribing once hydrates it from
 * localStorage and applies the saved theme app-wide (even on pages with no
 * other prefs consumer). When Clerk is configured, the inner bridge loads the
 * signed-in user's prefs from `unsafeMetadata.prefs` and registers the remote
 * persister so writes follow the user across devices. Renders nothing.
 */
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { authEnabled } from '../lib/auth';
import { usePrefs, registerRemoteBackend } from '../lib/prefs';
import type { Prefs } from '../lib/config';

function ClerkPrefsBridge() {
  const { isLoaded, isSignedIn, user } = useUser();
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    registerRemoteBackend(user.unsafeMetadata?.prefs, (prefs: Prefs) => {
      void user
        .update({ unsafeMetadata: { ...(user.unsafeMetadata ?? {}), prefs } })
        .catch(() => {
          /* best-effort: localStorage still holds the change */
        });
    });
  }, [isLoaded, isSignedIn, user]);
  return null;
}

export default function PrefsBoot() {
  usePrefs(); // subscribe → hydrate from localStorage + apply theme
  return authEnabled() ? <ClerkPrefsBridge /> : null;
}
