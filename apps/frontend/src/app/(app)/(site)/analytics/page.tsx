export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${getAppName()} Analytics`,
  description: '',
};
export default async function Index() {
  return <PlatformAnalytics />;
}
