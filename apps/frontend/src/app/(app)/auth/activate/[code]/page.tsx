export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AfterActivate } from '@gitroom/frontend/components/auth/after.activate';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${
    getAppName()
  } - Activate your account`,
  description: '',
};
export default async function Auth() {
  return <AfterActivate />;
}
