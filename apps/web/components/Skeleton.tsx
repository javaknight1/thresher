/**
 * Skeleton loaders (content placeholders) shown while a component waits on an
 * API request — a shape-matched shimmer stands in for the real content so the
 * layout doesn't jump when data arrives. `Skeleton` is the primitive; the
 * exported layouts (`ScanBoardSkeleton`, `AnalyzeSkeleton`, `ProfileSkeleton`)
 * mirror the real components they replace.
 */
import styles from './Skeleton.module.css';

/** One shimmer block. Purely decorative — hidden from assistive tech. */
export function Skeleton({
  className,
  width,
  height,
  radius,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}) {
  return (
    <span
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** Table placeholder for the Scan board (design §6.3). */
export function ScanBoardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className={styles.board}
      data-testid="scan-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading setups"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton className={styles.cellRank} height={12} />
          <Skeleton className={styles.cellSymbol} height={18} />
          <Skeleton className={styles.cell} height={12} />
          <Skeleton className={styles.cell} height={12} />
          <Skeleton className={styles.cell} height={12} />
          <Skeleton className={styles.cellScore} height={12} />
          <Skeleton className={styles.cellCaret} height={12} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for the full Analyze view (card + ladder + chart + story + grid). */
export function AnalyzeSkeleton() {
  return (
    <div
      className={styles.analyze}
      data-testid="analyze-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading analysis"
    >
      <div className={styles.cardRow}>
        <Skeleton className={styles.card} />
        <Skeleton className={styles.side} />
      </div>
      <Skeleton className={styles.chart} />
      <Skeleton className={styles.story} />
      <div className={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={styles.gridCell} />
        ))}
      </div>
    </div>
  );
}

/** Placeholder for the company-context panel while fundamentals load. */
export function ProfileSkeleton() {
  return (
    <div
      className={styles.profile}
      data-testid="profile-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading company details"
    >
      <div className={styles.profileHead}>
        <Skeleton width={40} height={40} radius={8} />
        <div className={styles.profileTitle}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <div className={styles.profileStats}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={34} radius={6} />
        ))}
      </div>
    </div>
  );
}
