/**
 * The trade story — design §6.2 item 5. The engine's generated narrative,
 * framed in a panel whose left border carries the direction's semantic color
 * (neutral when the engine refuses, matching the prototype's dirColor).
 */
import type { Direction } from '@thresher/engine';
import styles from './TradeStory.module.css';

const DIRECTION_COLOR: Record<Direction, string> = {
  long: 'var(--long)',
  short: 'var(--short)',
  none: 'var(--neutral)',
};

export interface TradeStoryProps {
  story: string;
  direction: Direction;
}

export function TradeStory({ story, direction }: TradeStoryProps) {
  return (
    <section
      className={`panel ${styles.root}`}
      style={{ borderLeftColor: DIRECTION_COLOR[direction] }}
    >
      <h2 className={`kicker ${styles.heading}`}>The trade story</h2>
      <p className={styles.body} data-testid="trade-story">
        {story}
      </p>
    </section>
  );
}

export default TradeStory;
