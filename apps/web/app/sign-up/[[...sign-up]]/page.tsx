import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { authEnabled } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  if (!authEnabled()) redirect('/app');
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <SignUp />
    </div>
  );
}
