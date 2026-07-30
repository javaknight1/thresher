import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { authEnabled } from '../../../lib/auth';

// Rendered only when Clerk is configured; without keys there is nothing to sign
// into, so fall through to the app. Dynamic so a keyless build never prerenders
// the Clerk component.
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  if (!authEnabled()) redirect('/app');
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <SignIn />
    </div>
  );
}
