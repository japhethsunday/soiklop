export const dynamic = 'force-dynamic';
import { Forgot } from '@gitroom/frontend/components/auth/forgot';
import { Metadata } from 'next';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${getAppName()} Forgot Password`,
  description: '',
};
export default async function Auth() {
  return <Forgot />;
}
