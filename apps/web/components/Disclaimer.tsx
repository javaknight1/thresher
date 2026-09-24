/**
 * Standing disclaimer — design §6.2 item 7, methodology II.10 item 7.
 * Hard rule: renders on EVERY page that shows a trade plan. The first
 * paragraph's wording is verbatim from the methodology doc — do not edit it.
 */
import Link from 'next/link';
import styles from './Disclaimer.module.css';

export function Disclaimer({ assetClass = 'equity' }: { assetClass?: 'equity' | 'crypto' }) {
  const isCrypto = assetClass === 'crypto';
  return (
    <div className={styles.root} data-testid="disclaimer">
      <p className={styles.text}>
        Nothing here is financial advice. The engine reports the technical structure and the
        arithmetic of a defined-risk setup. The decision, and the risk, belong to the user.
      </p>
      <p className={styles.text}>
        Confidence measures signal agreement across the four families — it is not a calibrated win
        probability. Market data comes from a delayed, free-tier feed, and every response carries
        the timestamp of the data it was computed from.{' '}
        {isCrypto && (
          <>
            Crypto trades 24/7 with no earnings or fundamentals, and reported volume is unreliable
            across exchanges — so the volume signal is weighted lightly and stops run wider.{' '}
          </>
        )}
        <Link
          href={isCrypto ? '/methodology/crypto/limitations' : '/methodology/limitations'}
          className="deep-link"
        >
          What the engine cannot see
        </Link>
      </p>
    </div>
  );
}

export default Disclaimer;
