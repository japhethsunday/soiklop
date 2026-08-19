'use client';

import { LOGO_URL } from '@gitroom/helpers/utils/brand.assets';

/**
 * Application logo.
 *
 * The mark used to be a hard-coded inline SVG of the upstream project's logo,
 * which meant shipping another product's brand and editing a component to
 * change it. It now renders `/logo.svg`, so replacing the brand is a matter of
 * dropping in one file.
 */
export const Logo = () => {
  return (
    <img
      src={LOGO_URL}
      alt=""
      width={60}
      height={60}
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    />
  );
};
