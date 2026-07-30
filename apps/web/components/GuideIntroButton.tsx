'use client';

/**
 * "Watch the quick intro" — replays the onboarding wizard from the guide page
 * for anyone (no persistence, works signed-out). Also the keyless hook the e2e
 * uses to exercise the wizard without a login.
 */
import { useState } from 'react';
import OnboardingWizard from './OnboardingWizard';
import styles from './GuideIntroButton.module.css';

export default function GuideIntroButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={styles.btn} data-testid="watch-intro" onClick={() => setOpen(true)}>
        ▸ Watch the quick intro
      </button>
      {open && <OnboardingWizard onClose={() => setOpen(false)} />}
    </>
  );
}
