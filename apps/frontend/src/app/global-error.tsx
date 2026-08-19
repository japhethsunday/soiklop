'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const { sentryDsn } = useVariables();

  useEffect(() => {
    if (!sentryDsn) {
      return;
    }
    const eventId = Sentry.captureException(error);
    Sentry.showReportDialog({
      eventId,
      title: 'Something broke!',
      subtitle: 'Please help us fix the issue by providing some details.',
      labelComments: 'What happened?',
      labelName: 'Your name',
      labelEmail: 'Your email',
      labelSubmit: 'Send Report',
      lang: 'en',
    });

  }, [error]);
  // `NextError statusCode={0}` used to render here, which paints an empty
  // white page. With no Sentry DSN configured that left a crash with no
  // visible cause anywhere -- in the UI, the console, or a dashboard.
  return (
    <html>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#0b0b0f',
          color: '#f4f4f5',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 720, width: '100%' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '0 0 16px' }}>
            The application failed to render. The details below identify the
            cause.
          </p>
          <pre
            style={{
              background: '#17171d',
              borderRadius: 6,
              padding: 12,
              fontSize: 12,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error?.message || 'Unknown error'}
            {error?.digest ? `\n\nDigest: ${error.digest}` : ''}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #3f3f46',
              background: '#27272a',
              color: '#f4f4f5',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
