/**
 * URLs for the brand assets in the frontend's `public` directory.
 *
 * The logo and the favicon are long-lived paths, so a browser that has already
 * loaded them will keep serving its copy after the brand changes — a favicon in
 * particular can survive a hard reload. Every reference goes through these
 * constants and carries a version token, so bumping `BRAND_ASSET_VERSION` when
 * the artwork changes gives the browser a URL it has never seen and the new
 * mark appears immediately.
 */
export const BRAND_ASSET_VERSION = '2';

export const LOGO_URL = `/logo.svg?v=${BRAND_ASSET_VERSION}`;
export const FAVICON_URL = `/favicon.ico?v=${BRAND_ASSET_VERSION}`;
