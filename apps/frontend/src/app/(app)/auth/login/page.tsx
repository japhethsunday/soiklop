export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Metadata } from 'next';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${getAppName()} Login`,
  description: '',
};
export default async function Auth() {
  return <Login />;
}
