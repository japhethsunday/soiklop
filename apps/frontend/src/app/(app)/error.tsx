'use client';

import { useEffect } from 'react';
import { Button } from '@gitroom/react/form/button';

/**
 * Segment-level error boundary for the authenticated app.
 *
 * Without this, a client-side render error anywhere under (app) escalates to
 * `global-error.tsx`, which renders Next's bare error page and shows the user
 * a blank white screen carrying no information at all. That made a crash on
 * one page indistinguishable from a broken deployment.
 *
 * This keeps the failure inside the segment, states what went wrong, and
 * offers a retry that re-renders without a full page reload.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console so a report can quote the real cause
    // even when no error-reporting service is configured.
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px]">
      <div className="flex flex-col gap-[10px] max-w-[720px]">
        <h1 className="text-newTextColor text-[20px] font-[600]">
          Something went wrong on this page
        </h1>
        <p className="text-newTextColor opacity-70 text-[14px]">
          The rest of the app is still working. You can retry this page, or go
          back and try a different section.
        </p>

        <pre className="bg-newBgLineColor text-newTextColor text-[12px] rounded-[6px] p-[12px] overflow-x-auto whitespace-pre-wrap">
          {error?.message || 'Unknown error'}
          {error?.digest ? `\n\nDigest: ${error.digest}` : ''}
        </pre>

        <div className="flex gap-[10px]">
          <Button onClick={() => reset()}>Try again</Button>
          <Button
            secondary={true}
            onClick={() => {
              window.location.href = '/launches';
            }}
          >
            Back to calendar
          </Button>
        </div>
      </div>
    </div>
  );
}
