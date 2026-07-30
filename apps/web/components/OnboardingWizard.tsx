'use client';

/**
 * First-login onboarding wizard — a small stack of cards covering the bare
 * minimum to get started, drawn from the shared guide content (lib/guide-content
 * — same source as /guide). Skippable, with Back/Next and a Done on the last
 * card. Persisting "seen it" is the caller's job (OnboardingGate); this is pure
 * UI so it can also be replayed from the guide page and tested keyless.
 */
import { useState } from 'react';
import { GUIDE_SECTIONS } from '../lib/guide-content';
import WizardCover from './WizardCover';
import styles from './OnboardingWizard.module.css';

export interface OnboardingWizardProps {
  onClose: () => void;
}

export default function OnboardingWizard({ onClose }: OnboardingWizardProps) {
  const steps = GUIDE_SECTIONS;
  const [i, setI] = useState(0);
  const step = steps[i];
  const isLast = i === steps.length - 1;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" data-testid="onboarding">
      <div className={styles.card}>
        <div className={styles.cover}>
          <WizardCover art={step.cover} />
          <div className={styles.coverOverlay}>
            <span className={styles.coverKicker}>Welcome to Thresher</span>
            <span className={styles.coverStep} data-testid="onboarding-progress">
              {i + 1} / {steps.length}
            </span>
          </div>
        </div>

        <div className={styles.body}>
          <h2 className={styles.title}>{step.title}</h2>
          <p className={styles.lead}>{step.lead}</p>
          <ul className={styles.points}>
            {step.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <button className={styles.skip} onClick={onClose} data-testid="onboarding-skip">
            Skip
          </button>
          <div className={styles.dots} aria-hidden="true">
            {steps.map((s, d) => (
              <span key={s.id} className={d === i ? styles.dotActive : styles.dot} />
            ))}
          </div>
          <div className={styles.navBtns}>
            {i > 0 && (
              <button className={styles.back} onClick={() => setI(i - 1)} data-testid="onboarding-back">
                Back
              </button>
            )}
            {isLast ? (
              <button className={styles.next} onClick={onClose} data-testid="onboarding-done">
                Open the board →
              </button>
            ) : (
              <button
                className={styles.next}
                onClick={() => setI(i + 1)}
                data-testid="onboarding-next"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
