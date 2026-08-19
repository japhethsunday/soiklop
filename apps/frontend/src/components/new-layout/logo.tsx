'use client';

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
      src="/logo.svg"
      alt=""
      width={60}
      height={60}
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    />
  );
};
