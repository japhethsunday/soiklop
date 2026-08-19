import { Plugs } from '@gitroom/frontend/components/plugs/plugs';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { getAppName } from '@gitroom/helpers/utils/app.name';
export const metadata: Metadata = {
  title: `${getAppName()} Plugs`,
  description: '',
};
export default async function Index() {
  return <Plugs />;
}
