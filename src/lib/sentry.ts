export type SentryClient = typeof import('@sentry/react');

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  const Sentry = (await import('@sentry/react')) as unknown as SentryClient;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,
    tracesSampleRate: 0,
  });
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = (await import('@sentry/react')) as unknown as SentryClient;
  if (context && Object.keys(context).length) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
    return;
  }
  Sentry.captureException(error);
}

