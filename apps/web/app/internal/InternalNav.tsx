'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './internal.module.css';

const SECTIONS = [
  { href: '/internal', label: 'Overview' },
  { href: '/internal/keys', label: 'Data browser' },
  { href: '/internal/integrity', label: 'Integrity' },
  { href: '/internal/maintenance', label: 'Maintenance' },
];

export default function InternalNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.sideNav} aria-label="internal sections">
      {SECTIONS.map((s) => {
        const active = pathname === s.href;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`${styles.sideLink} ${active ? styles.sideLinkActive : ''}`}
            aria-current={active ? 'page' : undefined}
            data-testid={`internal-nav-${s.label.split(' ')[0].toLowerCase()}`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
