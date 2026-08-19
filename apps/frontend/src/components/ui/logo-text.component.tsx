import React from 'react';
import { getAppName } from '@gitroom/helpers/utils/app.name';
import { LOGO_URL } from '@gitroom/helpers/utils/brand.assets';

/**
 * Wordmark: the brand mark next to the product name.
 *
 * This used to be the upstream project's wordmark as inline SVG paths, so the
 * login and billing screens showed another product's brand and renaming meant
 * redrawing vectors. The mark now comes from `/logo.svg` and the name from
 * `getAppName()`, so both follow configuration.
 *
 * The name is real text rather than SVG `<text>` so it always renders in the
 * app's own font instead of depending on a font being available to whatever
 * rasterises the file.
 */
export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[10px]">
      <img src={LOGO_URL} alt="" width={33} height={33} />
      <span className="text-[22px] font-[600] tracking-[-0.5px] text-current">
        {getAppName()}
      </span>
    </div>
  );
};
