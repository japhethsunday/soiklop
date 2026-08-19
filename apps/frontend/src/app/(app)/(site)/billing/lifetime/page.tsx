import { LifetimeDeal } from '@gitroom/frontend/components/billing/lifetime.deal';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${getAppName()} Lifetime deal`,
  description: '',
};
export default async function Page() {
  return <LifetimeDeal />;
}
