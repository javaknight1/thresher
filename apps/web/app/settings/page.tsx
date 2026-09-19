/**
 * /settings — user preferences (display/convenience only; never engine math).
 * Protected in middleware.ts when auth is on; open in keyless mode.
 */
import SettingsApp from '../../components/SettingsApp';

export const metadata = { title: 'Settings — Thresher' };

export default function SettingsPage() {
  return <SettingsApp />;
}
