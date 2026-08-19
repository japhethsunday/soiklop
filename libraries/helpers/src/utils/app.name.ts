/**
 * Single source of truth for the product name shown to users.
 *
 * Page titles previously inlined `isGeneralServerSide() ? 'Postiz' : 'Gitroom'`
 * in fifteen places, so rebranding meant editing every route. The name now
 * comes from configuration with a sensible default, and callers ask for it.
 */
export const getAppName = (): string =>
  process.env.NEXT_PUBLIC_APP_NAME || 'Soiklop';
