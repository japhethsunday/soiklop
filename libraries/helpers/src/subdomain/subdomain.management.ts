import { parse } from 'tldts';

/**
 * Resolves the cookie `Domain` attribute for a given site URL.
 *
 * `allowPrivateDomains` matters on platform-provided hostnames. Public-suffix
 * entries such as `vercel.app`, `up.railway.app` or `pages.dev` are registrable
 * boundaries, so without this flag a host like `my-app.vercel.app` resolves to
 * `.vercel.app` -- a domain browsers refuse to set cookies on, which silently
 * breaks login with no error anywhere. Treating the private suffix as part of
 * the public suffix yields `.my-app.vercel.app`, which is valid.
 *
 * Behaviour on ordinary domains is unchanged: `app.example.com` still resolves
 * to `.example.com`, and `postiz.example.co.uk` to `.example.co.uk`, so cookie
 * sharing across subdomains keeps working exactly as before.
 */
export function getCookieUrlFromDomain(domain: string) {
  const url = parse(domain, { allowPrivateDomains: true });
  return url.domain! ? '.' + url.domain! : url.hostname!;
}
