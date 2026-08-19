import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';
import { getAppName } from '@gitroom/helpers/utils/app.name';

export const metadata: Metadata = {
  title: `${getAppName()} Media`,
  description: '',
};

export default async function Page() {
  return <MediaLayoutComponent />
}
