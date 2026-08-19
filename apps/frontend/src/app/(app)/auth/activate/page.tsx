export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Activate } from '@gitroom/frontend/components/auth/activate';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${
    getAppName()
  } - Activate your account`,
  description: '',
};
export default async function Auth() {
  return <Activate />;
}
