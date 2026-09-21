/** /internal/maintenance — Maintenance (tier E): write actions (guarded). */
import MaintenancePanel from '../MaintenancePanel';
import { redisConfigured } from '../../../lib/internal/admin';
import styles from '../internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function InternalMaintenance() {
  const redis = redisConfigured();
  return (
    <>
      <h1 className={styles.h1}>Maintenance</h1>
      <p className={styles.sub}>
        {redis
          ? 'Write actions against Upstash. Destructive ones ask to confirm.'
          : 'In-memory mode — actions affect only this isolate.'}
      </p>
      <MaintenancePanel />
    </>
  );
}
